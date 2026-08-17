/* SM ToolBox — cycle count decode worker.
   Runs zxing-wasm off the main thread so the camera preview and the confirm
   modal stay responsive during long scanning sessions.

   Note: the library's DEFAULT locateFile fetches the .wasm from a public CDN,
   which would break scanning with no signal. The override below is required,
   not cosmetic, and must be set before the first decode.

   Protocol:  main   -> { id, buf (transferred ArrayBuffer), w, h, opts }
              worker -> { id, result } | { id, err }                        */
importScripts('lib/zxing-reader.js');

var prepared = false;
function prep() {
  if (prepared) return;
  prepared = true;
  try {
    if (self.ZXingWASM && ZXingWASM.prepareZXingModule) {
      ZXingWASM.prepareZXingModule({
        overrides: {
          locateFile: function (path) { return new URL('lib/' + path, self.location.href).href; }
        }
      });
    }
  } catch (e) {}
}

self.onmessage = function (e) {
  var d = e.data || {};
  if (!d || typeof d.id === 'undefined') return;
  try {
    prep();
    if (!self.ZXingWASM || !ZXingWASM.readBarcodes) { self.postMessage({ id: d.id, err: 'nolib' }); return; }
    // readBarcodes accepts any {data,width,height} pixmap and derives luminance
    // itself, so no ImageData construction and no grayscale pass is needed here.
    var pix = { data: new Uint8ClampedArray(d.buf), width: d.w, height: d.h };
    ZXingWASM.readBarcodes(pix, d.opts).then(
      function (res) { self.postMessage({ id: d.id, result: res }); },
      function (err) { self.postMessage({ id: d.id, err: String(err) }); }
    );
  } catch (err2) {
    self.postMessage({ id: d.id, err: String(err2) });
  }
};
