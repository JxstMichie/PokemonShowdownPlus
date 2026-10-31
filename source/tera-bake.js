(() => {
  const TERA_OPACITY = 0.4, TERA_BRIGHTNESS = 1.5, TERA_SPRITE_SAT = 0.7;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  /*
  Couldn't find a browser api to do this so I resorted to dark magic for this one
  I won't even pretend what any of these magic numbers mean, but it works
  */

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  function readChunks(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    const chunks = [];
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
      offset += 12 + length;
      if (type === "IEND") break;
    }
    return chunks;
  }
  const joinBytes = (parts) => {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };

  function parseApng(buffer) {
    const chunks = readChunks(buffer);
    const header = chunks.find((chunk) => chunk.type === "IHDR").data;
    const headerView = new DataView(header.buffer, header.byteOffset, header.length);
    const width = headerView.getUint32(0), height = headerView.getUint32(4);
    const control = chunks.find((chunk) => chunk.type === "acTL");
    const shared = [], frames = [], still = [];
    let current = null, seenImage = false;
    for (const chunk of chunks) {
      const { type, data } = chunk;
      if (type === "IHDR" || type === "IEND" || type === "acTL") continue;
      if (type === "fcTL") {
        const view = new DataView(data.buffer, data.byteOffset, data.length);
        current = { w: view.getUint32(4), h: view.getUint32(8), x: view.getUint32(12), y: view.getUint32(16), num: view.getUint16(20), den: view.getUint16(22) || 100, dispose: data[24], blend: data[25], data: [] };
        frames.push(current);
      } else if (type === "IDAT") {
        seenImage = true;
        still.push(data);
        if (current) current.data.push(data);
      } else if (type === "fdAT") {
        if (current) current.data.push(data.subarray(4));
      } else if (!seenImage) {
        shared.push(chunk);
      }
    }
    if (!control || !frames.length) frames.splice(0, frames.length, { w: width, h: height, x: 0, y: 0, num: 0, den: 100, dispose: 0, blend: 0, data: still });
    const plays = control ? new DataView(control.data.buffer, control.data.byteOffset, control.data.length).getUint32(4) : 0;
    return { width, height, header, shared, frames, plays };
  }

  async function decodeFrame(parsed, frame) {
    const header = new Uint8Array(parsed.header);
    const view = new DataView(header.buffer);
    view.setUint32(0, frame.w);
    view.setUint32(4, frame.h);
    const png = joinBytes([
      Uint8Array.from(PNG_SIGNATURE),
      pngChunk("IHDR", header),
      ...parsed.shared.map((chunk) => pngChunk(chunk.type, chunk.data)),
      ...frame.data.map((piece) => pngChunk("IDAT", piece)),
      pngChunk("IEND", new Uint8Array(0))
    ]);
    return createImageBitmap(new Blob([png], { type: "image/png" }));
  }

  function buildTint(texture, color, width, height) {
    const tint = makeCanvas(width, height);
    const context = tint.getContext("2d");
    const scale = Math.max(width / texture.width, height / texture.height);
    context.drawImage(texture, (width - texture.width * scale) / 2, (height - texture.height * scale) / 2, texture.width * scale, texture.height * scale);
    if (!color) return tint;
    context.globalCompositeOperation = "color";
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    const lit = makeCanvas(width, height);
    const litContext = lit.getContext("2d");
    litContext.filter = `brightness(${TERA_BRIGHTNESS})`;
    litContext.drawImage(tint, 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(lit, 0, 0);
    return tint;
  }

  const canvasBlob = (canvas) => (canvas.convertToBlob
    ? canvas.convertToBlob({ type: "image/png" })
    : new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png")));
  const u32 = (value) => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value); return out; };

  function makeCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  let texturePromise = null;
  const loadTexture = (source) => texturePromise || (texturePromise = fetch(source).then((response) => response.blob()).then((blob) => createImageBitmap(blob)));

  async function bakeFrame(parsed, frame, tint, color) {
    const bitmap = await decodeFrame(parsed, frame);
    const out = makeCanvas(frame.w, frame.h);
    const context = out.getContext("2d");
    if (color) context.filter = `saturate(${1 - TERA_SPRITE_SAT})`;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    context.filter = "none";
    context.globalCompositeOperation = "source-atop";
    context.globalAlpha = TERA_OPACITY;
    context.drawImage(tint, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    const encoded = readChunks(await (await canvasBlob(out)).arrayBuffer());
    return joinBytes(encoded.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  }

  async function bake({ url, color, texture }) {
    const textureBitmap = await loadTexture(texture);
    const parsed = parseApng(await (await fetch(url)).arrayBuffer());
    const { width, height, frames } = parsed;
    const tint = buildTint(textureBitmap, color, width, height);
    const idats = new Array(frames.length);
    let next = 0;
    const lane = async () => {
      while (next < frames.length) {
        const index = next++;
        idats[index] = await bakeFrame(parsed, frames[index], tint, color);
      }
    };
    await Promise.all(Array.from({ length: Math.max(2, Math.min(8, (self.navigator || navigator).hardwareConcurrency || 4)) }, lane));
    const parts = [
      Uint8Array.from(PNG_SIGNATURE),
      pngChunk("IHDR", joinBytes([u32(width), u32(height), Uint8Array.of(8, 6, 0, 0, 0)])),
      pngChunk("acTL", joinBytes([u32(frames.length), u32(parsed.plays)]))
    ];
    let sequence = 0;
    frames.forEach((frame, index) => {
      const control = new Uint8Array(26);
      const view = new DataView(control.buffer);
      view.setUint32(0, sequence++);
      view.setUint32(4, frame.w);
      view.setUint32(8, frame.h);
      view.setUint32(12, frame.x);
      view.setUint32(16, frame.y);
      view.setUint16(20, frame.num);
      view.setUint16(22, frame.den);
      control[24] = frame.dispose;
      control[25] = frame.blend;
      parts.push(pngChunk("fcTL", control));
      if (index === 0) parts.push(pngChunk("IDAT", idats[index]));
      else parts.push(pngChunk("fdAT", joinBytes([u32(sequence++), idats[index]])));
    });
    parts.push(pngChunk("IEND", new Uint8Array(0)));
    return new Blob(parts, { type: "image/png" });
  }

  self.__phdBake = bake;
  if (typeof document === "undefined") {
    self.onmessage = async (event) => {
      const { id, ...job } = event.data;
      try {
        self.postMessage({ id, blob: await bake(job) });
      } catch (error) {
        self.postMessage({ id, error: String(error) });
      }
    };
  }
})();
