const els={
  scanBtn:document.querySelector('#scanBtn'),
  stopBtn:document.querySelector('#stopBtn'),
  searchBtn:document.querySelector('#searchBtn'),
  input:document.querySelector('#barcodeInput'),
  status:document.querySelector('#status'),
  results:document.querySelector('#results'),
  selectedEdition:document.querySelector('#selectedEdition'),
  reader:document.querySelector('#reader'),
  template:document.querySelector('#releaseTemplate'),
  cameraPicker:document.querySelector('#cameraPicker'),
  cameraSelect:document.querySelector('#cameraSelect')
};

let scanner=null;
let scanning=false;
let lookupInProgress=false;
let cameras=[];
let lastBarcode='';

function setStatus(message,error=false){
  els.status.textContent=message||'';
  els.status.classList.toggle('error',error);
}

function normalizeBarcode(value){return String(value||'').replace(/\D/g,'')}

function mediumSummary(release){
  const formats=[];
  for(const medium of release.media||[]){if(medium.format) formats.push(medium.format)}
  return [...new Set(formats)].join(', ')||'No informado';
}

function labelParts(release){
  return (release['label-info-list']||[]).map(x=>({
    label:x.label?.name||'',
    catalog:x['catalog-number']||''
  }));
}

function labelSummary(release){
  const text=labelParts(release).map(x=>[x.label,x.catalog].filter(Boolean).join(' · ')).filter(Boolean).join(' / ');
  return text||'No informado';
}

function catalogSummary(release){
  return labelParts(release).map(x=>x.catalog).filter(Boolean).join(' ');
}

function artistSummary(release){
  return (release['artist-credit']||[]).map(x=>typeof x==='string'?x:(x.name||x.artist?.name||'')).join('')||'Artista no informado';
}

function addMeta(dl,label,value){
  const dt=document.createElement('dt');
  const dd=document.createElement('dd');
  dt.textContent=label; dd.textContent=value||'No informado';
  dl.append(dt,dd);
}

function discogsSearchUrl(release,barcode){
  const terms=[artistSummary(release),release.title,barcode||release.barcode,catalogSummary(release),release.country,release.date].filter(Boolean);
  const q=terms.join(' ');
  return 'https://www.discogs.com/search/?q='+encodeURIComponent(q)+'&type=release';
}

function editionSnapshot(release,barcode){
  return {
    artist:artistSummary(release),
    title:release.title||'',
    barcode:release.barcode||barcode||'',
    date:release.date||'',
    country:release.country||'',
    format:mediumSummary(release),
    label:labelSummary(release),
    catalog:catalogSummary(release),
    musicbrainzId:release.id||'',
    discogsSearch:discogsSearchUrl(release,barcode)
  };
}

function renderSelected(snapshot){
  els.selectedEdition.hidden=false;
  els.selectedEdition.innerHTML=`
    <article class="card chosen-card">
      <p class="eyebrow">Edición candidata seleccionada</p>
      <h2>${escapeHtml(snapshot.artist)} — ${escapeHtml(snapshot.title)}</h2>
      <p class="chosen-summary">${escapeHtml([snapshot.country,snapshot.date,snapshot.catalog].filter(Boolean).join(' · ')||'Faltan datos de edición')}</p>
      <div class="chosen-actions">
        <a class="discogs-cta" href="${snapshot.discogsSearch}" target="_blank" rel="noreferrer">Buscar esta edición en Discogs ↗</a>
        <button id="copyEditionBtn" class="secondary">Copiar datos</button>
      </div>
      <p class="hint">Próximo paso: asociar esta selección al registro exacto de tu hoja y guardar el URL/Release ID de Discogs.</p>
    </article>`;
  document.querySelector('#copyEditionBtn')?.addEventListener('click',async()=>{
    const text=[
      `${snapshot.artist} — ${snapshot.title}`,
      snapshot.country&&`País: ${snapshot.country}`,
      snapshot.date&&`Año/fecha: ${snapshot.date}`,
      snapshot.catalog&&`Catálogo: ${snapshot.catalog}`,
      snapshot.barcode&&`Barcode: ${snapshot.barcode}`,
      snapshot.label&&`Sello: ${snapshot.label}`,
      snapshot.format&&`Formato: ${snapshot.format}`,
      snapshot.musicbrainzId&&`MusicBrainz: https://musicbrainz.org/release/${snapshot.musicbrainzId}`
    ].filter(Boolean).join('\n');
    try{await navigator.clipboard.writeText(text);setStatus('Datos de la edición copiados.')}
    catch{setStatus('No pude copiar automáticamente los datos.',true)}
  });
  els.selectedEdition.scrollIntoView({behavior:'smooth',block:'start'});
}

function escapeHtml(value){
  return String(value||'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function render(releases,barcode){
  els.results.innerHTML='';
  els.selectedEdition.hidden=true;
  els.selectedEdition.innerHTML='';
  if(!releases.length){els.results.innerHTML='<p class="empty">MusicBrainz no encontró releases en vinilo para este código.</p>';return}
  releases.forEach((release,index)=>{
    const node=els.template.content.cloneNode(true);
    node.querySelector('.artist').textContent=artistSummary(release);
    node.querySelector('.title').textContent=release.title||'Sin título';
    node.querySelector('.badge').textContent=index===0?'Coincidencia':'Alternativa';
    const dl=node.querySelector('.meta');
    addMeta(dl,'Barcode',release.barcode||barcode);
    addMeta(dl,'Fecha',release.date);
    addMeta(dl,'País',release.country);
    addMeta(dl,'Formato',mediumSummary(release));
    addMeta(dl,'Sello / catálogo',labelSummary(release));
    addMeta(dl,'Estado',release.status);
    const mb=node.querySelector('.mb-link');
    mb.href='https://musicbrainz.org/release/'+encodeURIComponent(release.id);
    const discogs=node.querySelector('.discogs-search');
    discogs.href=discogsSearchUrl(release,barcode);
    node.querySelector('.choose-edition').addEventListener('click',()=>renderSelected(editionSnapshot(release,barcode)));
    els.results.appendChild(node);
  });
}

async function lookup(raw){
  if(lookupInProgress) return;
  const barcode=normalizeBarcode(raw);
  if(barcode.length<8){setStatus('Ingresá un EAN/UPC válido.',true);return}
  lookupInProgress=true;
  lastBarcode=barcode;
  els.input.value=barcode;
  await stopScanner();
  els.results.innerHTML='';
  els.selectedEdition.hidden=true;
  setStatus('Buscando ediciones compatibles…');
  try{
    const query=encodeURIComponent('barcode:'+barcode);
    const url='https://musicbrainz.org/ws/2/release/?query='+query+'&fmt=json&limit=25';
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error('MusicBrainz respondió '+response.status);
    const data=await response.json();
    const releases=(data.releases||[]).filter(r=>!r.media?.length||r.media.some(m=>/vinyl/i.test(m.format||'')));
    setStatus(releases.length
      ? releases.length+' edición'+(releases.length===1?'':'es')+' candidata'+(releases.length===1?'':'s')+'. Compará país, año, sello y catálogo.'
      : 'No encontramos una edición en vinilo verificable para ese barcode.');
    render(releases,barcode);
  }catch(err){
    console.error(err);
    setStatus('No pude consultar MusicBrainz. Probá de nuevo o usá el ingreso manual.',true);
  }finally{lookupInProgress=false}
}

function choosePreferredCamera(list){
  const rear=list.filter(c=>/back|rear|environment|trasera|camera 0|camera 1/i.test(c.label||''));
  return rear.at(-1)||list.at(-1)||list[0];
}

function populateCameraPicker(list,selectedId){
  els.cameraSelect.innerHTML='';
  list.forEach((camera,index)=>{
    const option=document.createElement('option');
    option.value=camera.id;
    option.textContent=camera.label||('Cámara '+(index+1));
    option.selected=camera.id===selectedId;
    els.cameraSelect.appendChild(option);
  });
  els.cameraPicker.hidden=list.length<2;
}

async function startScanner(cameraId){
  if(scanning) return;
  if(!window.Html5Qrcode){setStatus('El lector de cámara no pudo cargarse. Podés ingresar el código manualmente.',true);return}
  try{
    setStatus('Detectando cámaras…');
    cameras=await Html5Qrcode.getCameras();
    if(!cameras.length) throw new Error('El navegador no informó ninguna cámara disponible.');
    const preferred=cameraId?cameras.find(c=>c.id===cameraId):choosePreferredCamera(cameras);
    populateCameraPicker(cameras,preferred?.id);
    els.reader.innerHTML='';
    scanner=new Html5Qrcode('reader');
    scanning=true;
    els.scanBtn.hidden=true;
    els.stopBtn.hidden=false;
    setStatus('Abriendo '+(preferred?.label||'cámara')+'…');
    const config={
      fps:10,
      disableFlip:true,
      formatsToSupport:[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E]
    };
    await scanner.start(preferred.id,config,decodedText=>{
      if(lookupInProgress) return;
      navigator.vibrate?.(100);
      setStatus('Código detectado: '+decodedText);
      lookup(decodedText);
    },()=>{});
    setStatus('Apuntá el código de barras a la cámara.');
  }catch(err){
    console.error(err);
    const detail=err?.message||String(err||'');
    await stopScanner();
    setStatus('No pude iniciar la cámara'+(detail?' — '+detail:'')+'.',true);
  }
}

async function stopScanner(){
  if(scanner){
    try{if(scanning) await scanner.stop()}catch(err){console.warn(err)}
    try{scanner.clear()}catch{}
    scanner=null;
  }
  scanning=false;
  els.scanBtn.hidden=false;
  els.stopBtn.hidden=true;
  els.reader.innerHTML='';
}

els.scanBtn.addEventListener('click',()=>startScanner());
els.stopBtn.addEventListener('click',stopScanner);
els.cameraSelect.addEventListener('change',async()=>{
  const id=els.cameraSelect.value;
  await stopScanner();
  startScanner(id);
});
els.searchBtn.addEventListener('click',()=>lookup(els.input.value));
els.input.addEventListener('keydown',e=>{if(e.key==='Enter') lookup(els.input.value)});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&scanning) stopScanner()});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn))}
