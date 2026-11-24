const el=id=>document.getElementById(id);
const format=n=>Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:1}):'未算出';
function trend(values,years){
  const good=values.filter(Number.isFinite);
  if(!good.length)return '<p>この診療科の推計に必要な資料が不足しています。</p>';
  const low=Math.min(...good)-4,high=Math.max(...good)+4;
  const x=i=>32+90*i,y=v=>26+70*(high-v)/(high-low);
  const lines=values.map((v,i)=>i&&Number.isFinite(v)&&Number.isFinite(values[i-1])?'<line x1="'+x(i-1)+'" y1="'+y(values[i-1])+'" x2="'+x(i)+'" y2="'+y(v)+'" stroke="#197469" stroke-width="3"/>':'').join('');
  const points=values.map((v,i)=>'<text x="'+x(i)+'" y="119">'+years[i]+'</text>'+(Number.isFinite(v)?'<circle cx="'+x(i)+'" cy="'+y(v)+'" r="4" fill="#197469"/><text x="'+x(i)+'" y="'+(y(v)-9)+'">'+format(v)+'</text>':'')).join('');
  return '<svg viewBox="0 0 335 126" text-anchor="middle" role="img" aria-label="'+years.map((year,i)=>year+'年 '+format(values[i])).join('、')+'">'+lines+points+'</svg>';
}
async function start(){
  const response=await fetch('./data.json');
  if(!response.ok)throw Error();
  const data=await response.json(),region=el('region'),topic=el('topic'),pref=el('pref');
  const query=new URLSearchParams(location.search);
  const initial=data.regions.find(r=>r.code===query.get('region'))||data.regions.find(r=>r.code==='43203')||data.regions[0];
  for(const name of [...new Set(data.regions.map(r=>r.pref))])pref.add(new Option(name,name));
  pref.value=initial.pref;
  function regions(preferred){
    region.replaceChildren(...data.regions.filter(r=>r.pref===pref.value).map(r=>new Option(r.name,r.code)));
    if(data.regions.some(r=>r.pref===pref.value&&r.code===preferred))region.value=preferred;
  }
  regions(initial.code);
  function topics(preferred){
    const r=data.regions.find(v=>v.code===region.value);
    topic.replaceChildren(...r.items.map(i=>new Option(i.topic,i.topic)));
    if(r.items.some(i=>i.topic===preferred))topic.value=preferred;
  }
  function render(){
    const r=data.regions.find(v=>v.code===region.value),row=r.items.find(i=>i.topic===topic.value);
    const end=row.index.at(-1),change=Number.isFinite(end)?Math.round((end-100)*10)/10:null;
    const peak=Math.max(row.local.rate||0,row.prefRate||0,0.01);
    function bar(name,rate,cls){return '<div>'+name+'　<strong>'+format(rate)+'</strong></div><div class="bar '+cls+'"><i style="width:'+((rate||0)*100/peak)+'%"></i></div>'}
    el('results').innerHTML='<section><h2>'+r.name+'の'+row.topic+'の外来需要</h2><small>2025年から2040年への変化 · 参考推計</small><strong class="number">'+(change===null?'未算出':(change>0?'+':'')+format(change)+'%')+'</strong>'+trend(row.index,data.years)+'<small>需要指数（2025年＝100）</small></section><section><h2>'+r.name+'で'+row.topic+'を掲げる診療所</h2><strong class="number">'+format(row.local.count)+'</strong> 施設<p>人口1万人当たりの施設数</p>'+bar(r.name,row.local.rate,'')+bar(r.pref,row.prefRate,'pref')+'<small>医療情報ネット '+data.asOf.replace(/(....)(..)(..)/,'$1年$2月$3日')+'時点 ／ 2025年推計人口</small></section>';
    const url=new URL(location.href);url.searchParams.set('region',r.code);url.searchParams.set('topic',row.topic);history.replaceState(null,'',url);
  }
  topics(query.get('topic'));render();
  pref.onchange=()=>{regions();topics(topic.value);render()};region.onchange=()=>{topics(topic.value);render()};topic.onchange=render;
}
start().catch(()=>{el('results').textContent='地域データを読み込めません。通信を確認してページを開き直してください。'});
el('copy').onclick=async()=>{try{await navigator.clipboard.writeText(el('product').href);el('notice').textContent='製品ページのリンクをコピーしました。'}catch{el('notice').textContent='製品紹介のボタンを長押ししてリンクをコピーしてください。'}};
const installCard=el('install-card'),installButton=el('install-button'),installHelp=el('install-help');
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isAndroid=/Android/i.test(navigator.userAgent);
const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let installPrompt=null;
if((isIOS||isAndroid)&&!installed())installCard.hidden=false;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(!installed())installCard.hidden=false;});
window.addEventListener('appinstalled',()=>{installPrompt=null;installCard.hidden=true;});
installButton.addEventListener('click',async()=>{
  if(installed()){installCard.hidden=true;return;}
  if(installPrompt){
    const prompt=installPrompt;installPrompt=null;
    try{await prompt.prompt();await prompt.userChoice;}catch{}
    if(installed())installCard.hidden=true;
    return;
  }
  installHelp.hidden=!installHelp.hidden;
  installButton.setAttribute('aria-expanded',String(!installHelp.hidden));
  installHelp.textContent=isIOS
    ?'Safariの共有ボタン（四角から上矢印）をタップし、「ホーム画面に追加」→「追加」を選んでください。表示されない場合はメニューを下へスクロールしてください。'
    :isAndroid
      ?'ブラウザ右上のメニュー（︙）から「アプリをインストール」または「ホーム画面に追加」を選んでください。'
      :'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。';
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
