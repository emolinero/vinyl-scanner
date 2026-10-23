const els={
  scanBtn:document.querySelector('#scanBtn'),
  stopBtn:document.querySelector('#stopBtn'),
  searchBtn:document.querySelector('#searchBtn'),
  input:document.querySelector('#barcodeInput'),
  status:document.querySelector('#status'),
  results:document.querySelector('#results'),
  reader:document.querySelector('#reader'),
  template:document.querySelector('#releaseTemplate')
};

let reader=null;
let scanning=false;

function setStatus(message,error=false){
  els.status.textContent=message||'';
  els.status.classList.toggle('error',error);
}

function normalizeBarcode(value){
  return String(value||'').replace(/\D/g,'');
}

function mediumSummary(release){
  const formats=[];
  for(const medium of release.media||[]){
    if(medium.format) formats.push(medium.format);
  }
  return [...new Set(formats)].join(', ')||'No informado';
}

function labelSummary(release){
  return (release['label-info-list']||[]).map(x=>{
    const label=x.label?.name||'';
    const cat=x['catalog-number']||'';
    return [label,cat].filter(Boolean).join(' · ');
  }).filter(Boolean).join(' / ')||'No informado';
}

function artistSummary(release){
  return (release['artist-credit']||[]).map(x=>typeof x==='string'?x:(x.name||x.artist?.name||'')).join('')||'Artista no informado';
}

function addMeta(dl,label,value){
  const dt=document.createElement('dt');
  const dd=document.createElement('dd');
  dt.textContent=label;
  dd.textContent=value||'No informado';
  dl.append(dt,dd);
}

function render(releases,barcode){
  els.results.innerHTML='';
  if(!releases.length){
    els.results.innerHTML='<p class="empty">MusicBrainz no encontró releases en vinilo para este código.</p>';
    return;
  }

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
    const link=node.querySelector('.mb-link');
    link.href='https://musicbrainz.org/release/'+encodeURIComponent(release.id);
    els.results.appendChild(node);
  });
}

async function lookup(raw){
  const barcode=normalizeBarcode(raw);
  if(barcode.length<8){
    setStatus('Ingresá un EAN/UPC válido.',true);
    return;
  }

  els.input.value=barcode;
  stopScanner();
  els.results.innerHTML='';
  setStatus('Buscando ediciones…');

  try{
    const query=encodeURIComponent('barcode:'+barcode);
    const url='https://musicbrainz.org/ws/2/release/?query='+query+'&fmt=json&limit=25';
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error('MusicBrainz respondió '+response.status);
    const data=await response.json();
    const releases=(data.releases||[]).filter(r=>
      !r.media?.length || r.media.some(m=>/vinyl/i.test(m.format||''))
    );
    setStatus(releases.length
      ? releases.length+' edición'+(releases.length===1?'':'es')+' en vinilo encontrada'+(releases.length===1?'':'s')+'.'
      : 'No encontramos una edición en vinilo verificable para ese barcode.');
    render(releases,barcode);
  }catch(err){
    console.error(err);
    setStatus('No pude consultar MusicBrainz. Probá de nuevo o usá el ingreso manual.',true);
  }
}

async function startScanner(){
  if(scanning) return;
  if(!window.ZXing){
    setStatus('El lector de cámara no pudo cargarse. Podés ingresar el código manualmente.',true);
    return;
  }

  try{
    reader=new ZXing.BrowserMultiFormatReader();
    scanning=true;
    els.scanBtn.hidden=true;
    els.stopBtn.hidden=false;
    setStatus('Apuntá la cámara al código de barras.');

    const devices=await reader.listVideoInputDevices();
    const preferred=devices.find(d=>/back|rear|environment|trasera/i.test(d.label))||devices[devices.length-1];
    await reader.decodeFromVideoDevice(preferred?.deviceId,null,(result)=>{
      if(result){
        const text=result.getText();
        navigator.vibrate?.(80);
        lookup(text);
      }
    });
  }catch(err){
    console.error(err);
    stopScanner();
    setStatus('No pude abrir la cámara. Verificá el permiso del navegador.',true);
  }
}

function stopScanner(){
  if(reader){
    try{reader.reset()}catch{}
    reader=null;
  }
  scanning=false;
  els.scanBtn.hidden=false;
  els.stopBtn.hidden=true;
  els.reader.innerHTML='';
}

els.scanBtn.addEventListener('click',startScanner);
els.stopBtn.addEventListener('click',stopScanner);
els.searchBtn.addEventListener('click',()=>lookup(els.input.value));
els.input.addEventListener('keydown',e=>{if(e.key==='Enter') lookup(els.input.value)});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}