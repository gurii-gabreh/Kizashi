// 家の間取り 手書き共有ウィジェット（企画整理.md セクション4 項目4）。
// Canvas + Pointer Events APIによる簡易お絵描き機能。外部ライブラリ不要。
function initFloorplanWidget({ canvasId, undoBtnId, clearBtnId }) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  let strokes = [];
  let currentStroke = null;

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1c2126";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }

  // CSSでスケールされていても、canvas内部の座標系（width/height属性基準）に変換する
  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    currentStroke = [toCanvasCoords(e)];
    strokes.push(currentStroke);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!currentStroke) return;
    currentStroke.push(toCanvasCoords(e));
    redraw();
  });
  function endStroke() {
    currentStroke = null;
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  document.getElementById(undoBtnId).addEventListener("click", () => {
    strokes.pop();
    redraw();
  });
  document.getElementById(clearBtnId).addEventListener("click", () => {
    if (strokes.length === 0) return;
    if (!confirm("描いた内容を消去します。よろしいですか？")) return;
    strokes = [];
    redraw();
  });

  return {
    isEmpty: () => strokes.length === 0,
    toDataUrl: () => canvas.toDataURL("image/png"),
    clear: () => {
      strokes = [];
      redraw();
    },
  };
}
