import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadImage, uid } from '../imageUtils';

/**
 * Full-screen photo markup editor.
 *   - pinch / wheel to zoom, drag to pan (Move tool)
 *   - Arrow tool: drag to draw an arrow, then optionally give it a label
 *   - Text tool: tap to place a label (white text on a dark shadow box)
 *   - Crop tool: drag a rectangle, then Apply
 * All annotations are stored in ORIGINAL image coordinates so the photo can be
 * re-opened and re-edited any time. Saving renders a flattened JPEG for the PDF.
 */
const COLORS = ['#e5322d', '#ffd60a', '#1b2a5e', '#ffffff', '#1f7a4d'];

export default function PhotoEditor({ photo, onSave, onCancel }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState('move');
  const [color, setColor] = useState(COLORS[0]);
  const [items, setItems] = useState(photo.annotations || []);
  const [crop, setCrop] = useState(photo.crop || null);
  const [selected, setSelected] = useState(null);
  const [prompt, setPrompt] = useState(null); // {mode:'arrow'|'text'|'edit', x, y, value, arrowId}
  const [pendingCrop, setPendingCrop] = useState(null);
  const [saving, setSaving] = useState(false);

  // view transform: image px -> screen px
  const view = useRef({ s: 1, tx: 0, ty: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [, force] = useState(0);
  const redraw = () => force((n) => n + 1);

  useEffect(() => {
    loadImage(photo.original).then((img) => {
      imgRef.current = img;
      setReady(true);
    });
  }, [photo.original]);

  const region = () => {
    const img = imgRef.current;
    return crop || { x: 0, y: 0, w: img.width, h: img.height };
  };

  // Fit the current crop region into the stage
  function fit() {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    const r = region();
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const s = Math.min(W / r.w, H / r.h);
    view.current = { s, tx: (W - r.w * s) / 2 - r.x * s, ty: (H - r.h * s) / 2 - r.y * s };
  }

  useLayoutEffect(() => {
    if (!ready) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = stage.clientWidth * dpr;
      canvas.height = stage.clientHeight * dpr;
      canvas.style.width = stage.clientWidth + 'px';
      canvas.style.height = stage.clientHeight + 'px';
      fit();
      redraw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, crop]);

  // ---------- drawing ----------
  const metrics = () => {
    const img = imgRef.current;
    const L = Math.max(img.width, img.height);
    return { lw: L / 140, head: L / 32, font: Math.max(16, L / 32), pad: L / 120 };
  };

  function drawItems(ctx, list, opts = {}) {
    const m = metrics();
    for (const it of list) {
      const isSel = opts.selected === it.id;
      if (it.type === 'arrow') drawArrow(ctx, it, m, isSel);
      if (it.type === 'text') drawText(ctx, it.x, it.y, it.text, it.color, m, isSel);
    }
  }

  function drawArrow(ctx, a, m, sel) {
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // dark outline so it reads on any background
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,.55)' : a.color;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = pass === 0 ? m.lw * 1.9 : m.lw;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2 - Math.cos(ang) * m.head * 0.6, a.y2 - Math.sin(ang) * m.head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - Math.cos(ang - 0.45) * m.head, a.y2 - Math.sin(ang - 0.45) * m.head);
      ctx.lineTo(a.x2 - Math.cos(ang + 0.45) * m.head, a.y2 - Math.sin(ang + 0.45) * m.head);
      ctx.closePath();
      ctx.fill();
      if (pass === 0) ctx.stroke();
    }
    ctx.restore();
    if (a.label) {
      // label sits just behind the tail
      const off = m.font * 0.9;
      drawText(ctx, a.x1 - Math.cos(ang) * off, a.y1 - Math.sin(ang) * off, a.label, a.color, m, false, true);
    }
    if (sel) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = m.lw * 0.6;
      ctx.setLineDash([m.lw * 2, m.lw * 2]);
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function textBox(ctx, x, y, text, m, centered) {
    ctx.font = `600 ${m.font}px -apple-system, Helvetica, Arial, sans-serif`;
    const lines = String(text).split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + m.pad * 2;
    const h = lines.length * m.font * 1.25 + m.pad * 1.6;
    const bx = centered ? x - w / 2 : x;
    const by = centered ? y - h / 2 : y;
    return { bx, by, w, h, lines };
  }

  function drawText(ctx, x, y, text, color, m, sel, centered = false) {
    ctx.save();
    const { bx, by, w, h, lines } = textBox(ctx, x, y, text, m, centered);
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = m.pad * 2;
    ctx.shadowOffsetY = m.pad * 0.6;
    ctx.fillStyle = 'rgba(15,15,20,.78)';
    roundRect(ctx, bx, by, w, h, m.pad);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = color === '#ffffff' || color === '#ffd60a' ? color : '#ffffff';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + m.pad, by + m.pad * 0.8 + i * m.font * 1.25));
    if (color !== '#ffffff') {
      ctx.strokeStyle = color;
      ctx.lineWidth = m.lw * 0.5;
      roundRect(ctx, bx, by, w, h, m.pad);
      ctx.stroke();
    }
    if (sel) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = m.lw * 0.6;
      ctx.setLineDash([m.lw * 2, m.lw * 2]);
      roundRect(ctx, bx - m.pad, by - m.pad, w + m.pad * 2, h + m.pad * 2, m.pad);
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // paint the on-screen canvas
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { s, tx, ty } = view.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, tx * dpr, ty * dpr);
    ctx.drawImage(img, 0, 0);
    const r = region();
    // dim everything outside the crop
    if (crop) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.beginPath();
      ctx.rect(-1e5, -1e5, 2e5, 2e5);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill('evenodd');
      ctx.restore();
    }
    const live = gesture.current?.draft ? [...items, gesture.current.draft] : items;
    drawItems(ctx, live, { selected });
    const pc = pendingCrop || (gesture.current?.type === 'crop' && gesture.current.rect);
    if (pc) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      ctx.rect(-1e5, -1e5, 2e5, 2e5);
      ctx.rect(pc.x, pc.y, pc.w, pc.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / s;
      ctx.setLineDash([8 / s, 6 / s]);
      ctx.strokeRect(pc.x, pc.y, pc.w, pc.h);
      ctx.restore();
    }
  });

  // ---------- coordinate helpers ----------
  const toImg = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const { s, tx, ty } = view.current;
    const img = imgRef.current;
    // clamp so arrows / labels always land on the photo
    return {
      x: Math.max(0, Math.min(img.width, (clientX - rect.left - tx) / s)),
      y: Math.max(0, Math.min(img.height, (clientY - rect.top - ty) / s)),
    };
  };

  function hitTest(p) {
    const m = metrics();
    const ctx = canvasRef.current.getContext('2d');
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.type === 'text') {
        const b = textBox(ctx, it.x, it.y, it.text, m, false);
        if (p.x >= b.bx && p.x <= b.bx + b.w && p.y >= b.by && p.y <= b.by + b.h) return it;
      } else if (it.type === 'arrow') {
        if (distToSeg(p, it) < m.head * 0.8) return it;
      }
    }
    return null;
  }

  function distToSeg(p, a) {
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x1) * dx + (p.y - a.y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x1 + t * dx;
    const py = a.y1 + t * dy;
    return Math.hypot(p.x - px, p.y - py);
  }

  // ---------- pointer handling ----------
  function onPointerDown(e) {
    if (prompt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: view.current.s, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...view.current } };
      return;
    }
    const p = toImg(e.clientX, e.clientY);
    if (tool === 'move') {
      const hit = hitTest(p);
      setSelected(hit ? hit.id : null);
      gesture.current = hit
        ? { type: 'drag', id: hit.id, last: p }
        : { type: 'pan', last: { x: e.clientX, y: e.clientY } };
    } else if (tool === 'arrow') {
      gesture.current = { type: 'arrow', draft: { id: uid(), type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color } };
    } else if (tool === 'crop') {
      gesture.current = { type: 'crop', start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
      setPendingCrop(null);
    } else if (tool === 'text') {
      setPrompt({ mode: 'text', x: p.x, y: p.y, value: '' });
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = clampScale(g.s0 * (d / g.d0));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = canvasRef.current.getBoundingClientRect();
      // keep the point under the initial midpoint fixed, then follow the midpoint
      const ix = (g.mid.x - rect.left - g.v0.tx) / g.v0.s;
      const iy = (g.mid.y - rect.top - g.v0.ty) / g.v0.s;
      view.current = { s, tx: mid.x - rect.left - ix * s, ty: mid.y - rect.top - iy * s };
      redraw();
      return;
    }
    const p = toImg(e.clientX, e.clientY);
    if (g.type === 'pan') {
      view.current.tx += e.clientX - g.last.x;
      view.current.ty += e.clientY - g.last.y;
      g.last = { x: e.clientX, y: e.clientY };
      redraw();
    } else if (g.type === 'drag') {
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      g.last = p;
      setItems((list) =>
        list.map((it) => {
          if (it.id !== g.id) return it;
          if (it.type === 'text') return { ...it, x: it.x + dx, y: it.y + dy };
          return { ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy };
        }),
      );
    } else if (g.type === 'arrow') {
      g.draft = { ...g.draft, x2: p.x, y2: p.y };
      redraw();
    } else if (g.type === 'crop') {
      g.rect = norm(g.start, p);
      redraw();
    }
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g.type === 'arrow') {
      const d = Math.hypot(g.draft.x2 - g.draft.x1, g.draft.y2 - g.draft.y1);
      if (d > metrics().head) {
        setItems((l) => [...l, g.draft]);
        setSelected(g.draft.id);
        setPrompt({ mode: 'arrow', arrowId: g.draft.id, value: '' });
      }
    } else if (g.type === 'crop') {
      const r = g.rect;
      if (r.w > 40 && r.h > 40) setPendingCrop(r);
    }
    redraw();
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const { s, tx, ty } = view.current;
    const ns = clampScale(s * (e.deltaY < 0 ? 1.12 : 0.89));
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    view.current = { s: ns, tx: mx - ((mx - tx) / s) * ns, ty: my - ((my - ty) / s) * ns };
    redraw();
  }

  const clampScale = (s) => {
    const img = imgRef.current;
    const stage = stageRef.current;
    const min = Math.min(stage.clientWidth / img.width, stage.clientHeight / img.height) * 0.5;
    return Math.max(min, Math.min(8, s));
  };

  function norm(a, b) {
    const img = imgRef.current;
    const x1 = Math.max(0, Math.min(a.x, b.x));
    const y1 = Math.max(0, Math.min(a.y, b.y));
    const x2 = Math.min(img.width, Math.max(a.x, b.x));
    const y2 = Math.min(img.height, Math.max(a.y, b.y));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // ---------- prompt (label text) ----------
  function commitPrompt() {
    const v = (prompt.value || '').trim();
    if (prompt.mode === 'text' && v) {
      const id = uid();
      setItems((l) => [...l, { id, type: 'text', x: prompt.x, y: prompt.y, text: v, color }]);
      setSelected(id);
    } else if (prompt.mode === 'arrow') {
      setItems((l) => l.map((it) => (it.id === prompt.arrowId ? { ...it, label: v } : it)));
    } else if (prompt.mode === 'edit') {
      setItems((l) =>
        l.map((it) => {
          if (it.id !== prompt.id) return it;
          return it.type === 'text' ? { ...it, text: v || it.text } : { ...it, label: v };
        }),
      );
    }
    setPrompt(null);
    if (prompt.mode === 'text') setTool('move');
  }

  function editSelected() {
    const it = items.find((i) => i.id === selected);
    if (!it) return;
    setPrompt({ mode: 'edit', id: it.id, value: it.type === 'text' ? it.text : it.label || '' });
  }

  function recolorSelected(c) {
    setColor(c);
    if (selected) setItems((l) => l.map((it) => (it.id === selected ? { ...it, color: c } : it)));
  }

  // ---------- save ----------
  async function save() {
    setSaving(true);
    try {
      const img = imgRef.current;
      const r = region();
      const out = document.createElement('canvas');
      out.width = Math.round(r.w);
      out.height = Math.round(r.h);
      const ctx = out.getContext('2d');
      ctx.translate(-r.x, -r.y);
      ctx.drawImage(img, 0, 0);
      drawItems(ctx, items, {});
      const annotated = out.toDataURL('image/jpeg', 0.85);
      await onSave({ annotated, annotations: items, crop });
    } finally {
      setSaving(false);
    }
  }

  const tips = {
    move: 'Drag to pan · pinch or scroll to zoom · tap an arrow or label to select and drag it',
    arrow: 'Drag from the label spot toward the problem. You can add a label after.',
    text: 'Tap where the label should go',
    crop: 'Drag a box around the area to keep, then tap Apply',
  };

  return (
    <div className="editor">
      <div className="editor-top">
        <button onClick={onCancel}>Cancel</button>
        <div className="title">Mark up photo</div>
        <button onClick={() => { setItems(photo.annotations || []); setCrop(photo.crop || null); setPendingCrop(null); setSelected(null); }}>Reset</button>
        <button className="save" onClick={save} disabled={!ready || saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="editor-tip">{tips[tool]}</div>
      <div
        className="editor-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {ready && <canvas ref={canvasRef} />}
        {!ready && <div style={{ color: '#aaa' }}>Loading photo…</div>}
        {prompt && (
          <div className="text-prompt" onPointerDown={(e) => e.stopPropagation()}>
            <div className="box">
              <strong>{prompt.mode === 'arrow' ? 'Label for this arrow (optional)' : prompt.mode === 'edit' ? 'Edit text' : 'Label text'}</strong>
              <input
                autoFocus
                value={prompt.value}
                placeholder="e.g. Leaking P-trap"
                onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && commitPrompt()}
              />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => { if (prompt.mode === 'text') setTool('move'); setPrompt(null); }}>
                  {prompt.mode === 'arrow' ? 'No label' : 'Cancel'}
                </button>
                <button className="btn btn-sm btn-primary" onClick={commitPrompt}>OK</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="editor-tools">
        <button className={tool === 'move' ? 'on' : ''} onClick={() => setTool('move')}>✥ Move</button>
        <button className={tool === 'arrow' ? 'on' : ''} onClick={() => { setTool('arrow'); setSelected(null); }}>➜ Arrow</button>
        <button className={tool === 'text' ? 'on' : ''} onClick={() => { setTool('text'); setSelected(null); }}>T Text</button>
        <button className={tool === 'crop' ? 'on' : ''} onClick={() => { setTool('crop'); setSelected(null); }}>⌗ Crop</button>
        {tool === 'crop' && pendingCrop && (
          <button className="on" onClick={() => { setCrop(pendingCrop); setPendingCrop(null); setTool('move'); }}>✓ Apply</button>
        )}
        {crop && <button onClick={() => { setCrop(null); setPendingCrop(null); }}>Uncrop</button>}
        <button onClick={() => { fit(); redraw(); }}>Fit</button>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => recolorSelected(c)}
            style={{ background: c, minWidth: 36, borderColor: color === c ? '#fff' : '#3a3a3a', borderWidth: color === c ? 3 : 1 }}
            aria-label={`color ${c}`}
          />
        ))}
        <button disabled={!selected} onClick={editSelected}>Edit text</button>
        <button disabled={!selected} onClick={() => { setItems((l) => l.filter((i) => i.id !== selected)); setSelected(null); }}>Delete</button>
        <button disabled={!items.length} onClick={() => { setItems((l) => l.slice(0, -1)); setSelected(null); }}>Undo</button>
      </div>
    </div>
  );
}
