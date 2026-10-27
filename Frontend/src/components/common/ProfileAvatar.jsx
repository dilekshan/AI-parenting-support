import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uploadProfilePhoto } from '../../services/authService.js';
import { baseUrl } from '../../services/api.js';
import './ProfileAvatar.css';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function ProfileAvatar({ user, className, children }) {
  const input = useRef(null);
  const dialog = useRef(null);
  const cropArea = useRef(null);
  const busy = useRef(false);
  const selection = useRef(0);
  const drag = useRef(null);
  const [url, setUrl] = useState(user?.profile_photo_url || null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setUrl(user?.profile_photo_url || null); setFailed(false); }, [user?.user_id, user?.profile_photo_url]);
  useEffect(() => () => { selection.current++; }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.src); }, [photo]);
  useEffect(() => {
    if (stage && !dialog.current.open) dialog.current.showModal();
    if (!stage && dialog.current.open) dialog.current.close();
  }, [stage]);
  const size = photo ? Math.min(photo.image.naturalWidth, photo.image.naturalHeight) / zoom : 1;
  function bounded(point, cropSize = size) {
    return { x: clamp(point.x, cropSize / 2, photo.image.naturalWidth - cropSize / 2), y: clamp(point.y, cropSize / 2, photo.image.naturalHeight - cropSize / 2) };
  }
  function adjustZoom(value) {
    if (!photo || busy.current) return;
    const next = clamp(value, 1, 4);
    drag.current = null;
    setZoom(next);
    setCenter(bounded(center, Math.min(photo.image.naturalWidth, photo.image.naturalHeight) / next));
  }
  useEffect(() => {
    const area = cropArea.current;
    if (!area || stage !== 'adjust') return;
    function wheel(event) {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1);
      adjustZoom(zoom * Math.exp(-clamp(delta, -200, 200) * 0.002));
    }
    // A non-passive listener prevents the modal scrolling while zooming.
    area.addEventListener('wheel', wheel, { passive: false });
    return () => area.removeEventListener('wheel', wheel);
  }, [stage, photo, zoom, center]);
  function close() {
    if (busy.current) return;
    selection.current++;
    setStage(null); setPhoto(null); setError(''); setReading(false);
    drag.current = null;
  }
  async function change(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy.current) return;
    setError('');
    if (file.size > 2 * 1024 * 1024) { setError('Choose a photo of 2 MB or smaller.'); return; }
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose a JPG, JPEG, PNG or WebP photo.'); return; }
    const version = ++selection.current;
    const src = URL.createObjectURL(file);
    setReading(true);
    try {
      const image = new Image();
      image.src = src;
      await image.decode();
      if (version !== selection.current) { URL.revokeObjectURL(src); return; }
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('Choose an image of at most 16 million pixels.');
      setPhoto({ src, image });
      setZoom(1);
      setCenter({ x: image.naturalWidth / 2, y: image.naturalHeight / 2 });
      setStage('adjust');
    } catch (reason) {
      URL.revokeObjectURL(src);
      if (version === selection.current) setError(reason.message || 'Unable to open this image.');
    } finally {
      if (version === selection.current) setReading(false);
    }
  }
  async function save() {
    if (!photo || busy.current) return;
    busy.current = true; setUploading(true); setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to crop this image in your browser.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 512, 512);
      context.drawImage(photo.image, center.x - size / 2, center.y - size / 2, size, size, 0, 0, 512, 512);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
      canvas.width = canvas.height = 0;
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Unable to create a cropped photo under 2 MB.');
      const result = await uploadProfilePhoto(blob);
      setUrl(result.profile_photo_url); setFailed(false);
      setStage(null); setPhoto(null);
    } catch (reason) {
      setError(reason.message);
    } finally {
      busy.current = false; setUploading(false);
    }
  }
  return <span className="profile-avatar-control">
    <button className={`profile-avatar-control__button ${className}`} type="button" aria-label="Upload profile photo" title="Upload profile photo" onClick={() => { setError(''); setStage('choose'); }}>
      {url && !failed ? <img src={new URL(url, baseUrl).href} alt="Your profile" onError={() => setFailed(true)} /> : children}
    </button>
    {createPortal(<dialog ref={dialog} className="profile-photo-dialog" aria-labelledby="profile-photo-title" onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id="profile-photo-title">{stage === 'adjust' ? 'Adjust Profile Photo' : 'Choose Profile Photo'}</h2>
      <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden onChange={change} />
      {stage === 'adjust' && photo && <>
        <p id="profile-photo-help">Click and drag to move the photo left, right, up or down. Use the scroll wheel to zoom in or out.</p>
        <div ref={cropArea} className="profile-photo-crop" tabIndex={uploading ? -1 : 0} role="group" aria-label="Photo crop position" aria-describedby="profile-photo-help"
          onPointerDown={event => { if (busy.current) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, center }; }}
          onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId || busy.current) return; const ratio = size / event.currentTarget.getBoundingClientRect().width; setCenter(bounded({ x: start.center.x - (event.clientX - start.x) * ratio, y: start.center.y - (event.clientY - start.y) * ratio })); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={event => { if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); adjustZoom(zoom * (event.key === '-' ? 1 / 1.1 : 1.1)); return; } if (busy.current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const step = size * (event.shiftKey ? 0.1 : 0.02); setCenter(bounded({ x: center.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0), y: center.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0) })); }}>
          <img src={photo.src} alt="Selected photo crop preview" draggable="false" style={{ width: `${photo.image.naturalWidth / size * 100}%`, height: `${photo.image.naturalHeight / size * 100}%`, left: `${(0.5 - center.x / size) * 100}%`, top: `${(0.5 - center.y / size) * 100}%` }} />
          <span className="profile-photo-mask" />
        </div>
      </>}
      {error && <p role="alert" className="profile-photo-error">{error}</p>}
      {reading && <p role="status">Opening photo...</p>}
      <div className="profile-photo-actions">
        <button type="button" disabled={uploading} onClick={close}>Cancel</button>
        {stage === 'adjust' ? <button type="button" disabled={uploading} onClick={save}>{uploading ? 'Saving...' : 'Save Photo'}</button> : <button type="button" disabled={reading} onClick={() => input.current?.click()}>Upload from Device</button>}
      </div>
    </dialog>, document.body)}
  </span>;
}
