// Export public regional aggregates from the product's saved official data.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
const directory=process.argv[2];
if(!directory) throw Error('製品版の保存フォルダーを指定してください');
const open=name=>new DatabaseSync(join(directory,name+'.sqlite'),{readOnly:true});
const source=open('medical-strategy'), master=open('master-data-v2');
const years=[2025,2030,2035,2040];
const recipes={'内科系':['2','15','18','38','47','58','59','60','61','69','79','87'],'精神科系':['23'],'神経内科系':['28','44','45'],'眼科系':['29'],'耳鼻咽喉科系':['32','48','53'],'皮膚科系':['62','5','6'],'整形外科系':['63','81'],'産婦人科系':['72','70','84'],'小児科系':['1'],'外科系':['8','58','59','60','61','71','80']};
const query=source.prepare(`select a.year,a.code,n.text name,sv.text svc,sx.text sex,a.age_from lo,a.age_to hi,a.value v,st.text status,s.family
from age_profile a join age_profile_source s using(src_no)
join age_text n on n.id=a.name_id join age_text sv on sv.id=a.svc
join age_text sx on sx.id=a.sex_id join age_text st on st.id=a.status_id
where (s.family='ipss' and a.year in (2020,2025,2030,2035,2040))
or (s.family in ('survey','survey-detail') and a.year=2023)
order by case s.family when 'survey' then 0 else 1 end,a.seq`);
const population=new Map(), survey=new Map(), names=new Map();
const key=(...v)=>v.join('|');
for(const r of query.iterate()){
 if(r.family==='ipss'){
   if(r.lo<0||!['男','女'].includes(r.sex))continue;
   const k=key(r.year,r.code,r.sex),list=population.get(k)||[];list.push(r);population.set(k,list);
   if(r.year===2025)names.set(r.code,r.name);
 }else{
   const k=key(r.code,r.svc,r.sex,r.lo,r.hi);
   if(!survey.has(k))survey.set(k,r);
 }
}
const shapes=new Map();
for(const r of survey.values())if(r.svc==='1'&&r.lo>=0){
 const k=key(r.code,r.sex), list=shapes.get(k)||[];list.push(r);shapes.set(k,list);
}
function populationBand(year,code,sex,lo,hi){
 const rows=(population.get(key(year,code,sex))||[]).filter(r=>r.lo>=lo&&r.hi<=hi).sort((a,b)=>a.lo-b.lo);
 if(!rows.length||rows[0].lo!==lo||rows.at(-1).hi!==hi||rows.some((r,i)=>r.v===null||r.v<0||(i&&r.lo!==rows[i-1].hi+1)))return null;
 return rows.reduce((sum,r)=>sum+r.v,0);
}
function demand(code,topic,year){
 const pref=code.slice(0,2);let sum=0;
 for(const sex of ['男','女']){
  if(topic==='産婦人科系'&&sex==='男')continue;
  const shape=(shapes.get(key(pref,sex))||[]).filter(r=>topic!=='小児科系'||r.hi<=14).sort((a,b)=>a.lo-b.lo);
  const end=topic==='小児科系'?14:199;
  if(!shape.length||shape[0].lo!==0||shape.at(-1).hi!==end||shape.some((r,i)=>i&&r.lo!==shape[i-1].hi+1))return null;
  for(const band of shape){
   let patients=0;
   for(const svc of recipes[topic]){
    const row=survey.get(key(pref,svc,sex,band.lo,band.hi));
    if(!row||row.v===null||row.v<0)return null;
    patients+=row.v;
   }
   const old=populationBand(2020,pref,sex,band.lo,band.hi),next=populationBand(2025,pref,sex,band.lo,band.hi),local=populationBand(year,code,sex,band.lo,band.hi);
   if(old===null||next===null||local===null)return null;
   const base=old+(next-old)*.6;
   if(base<=0)return null;
   sum+=patients/base*local;
  }
 }
 return sum;
}
const batch=master.prepare("select batch_no,as_of,count(*) n from facility_row where type='診療所' group by batch_no,as_of order by as_of desc,n desc limit 1").get();
if(!batch||master.prepare("select value from metadata where key='specialty_index_診療所'").get()?.value!=='complete')throw Error('診療科情報が未収集です');
const groups={
 '内科系':s=>s.includes('内科'),
 '精神科系':s=>s.includes('精神科')||s.includes('心療内科'),
 '神経内科系':s=>s.includes('神経内科')||s.includes('脳神経外科')||s.includes('神経科'),
 '眼科系':s=>s.includes('眼科'),
 '耳鼻咽喉科系':s=>s.includes('耳鼻'),
 '皮膚科系':s=>s.includes('皮膚科'),
 '整形外科系':s=>s.includes('整形外科')||s.includes('リウマチ科'),
 '産婦人科系':s=>s.includes('産婦人科')||s.includes('産科')||s.includes('婦人科'),
 '小児科系':s=>s.includes('小児科'),
 '外科系':s=>s.includes('外科')
};
const counts=new Map(), missing=new Set();
for(const r of master.prepare("select r.city_code code,i.specialties_json labels from facility_row r left join facility_specialty_index i on i.facility_id=r.id and i.facility_type=r.type where r.type='診療所' and r.batch_no=?").iterate(batch.batch_no)){
 if(!r.code)continue;
 if(r.labels===null){missing.add(r.code);missing.add(r.code.slice(0,2));continue;}
 const labels=JSON.parse(r.labels).map(s=>s.normalize('NFKC'));
 for(const [topic,match] of Object.entries(groups))if(labels.some(match))for(const code of [r.code,r.code.slice(0,2)])counts.set(key(code,topic),(counts.get(key(code,topic))||0)+1);
}
function pop(code){const a=populationBand(2025,code,'男',0,199),b=populationBand(2025,code,'女',0,199);return a===null||b===null?null:a+b}
const prefectures=new Map([...names].filter(([c])=>c.length===2));
for(const code of names.keys()){
 if(code.length!==5||!code.endsWith('00'))continue;
 const wards=[...names.keys()].filter(c=>c.length===5&&c!==code&&c.startsWith(code.slice(0,3)));
 if(!wards.length)continue;
 for(const topic of Object.keys(recipes))counts.set(key(code,topic),wards.reduce((sum,c)=>sum+(counts.get(key(c,topic))||0),0));
 if(wards.some(c=>missing.has(c)))missing.add(code);
}
const regions=[...names].filter(([code])=>code.length===5).map(([code,fullname])=>{
 const pref=prefectures.get(code.slice(0,2)),name=fullname.startsWith(pref)?fullname.slice(pref.length):fullname;
 const items=Object.keys(recipes).map(topic=>{
  const totals=years.map(y=>demand(code,topic,y));
  const index=totals.map(v=>v!==null&&totals[0]>0?Math.round(v/totals[0]*1000)/10:null);
  const count=missing.has(code)?null:counts.get(key(code,topic))||0, p=pop(code),pc=missing.has(code.slice(0,2))?null:counts.get(key(code.slice(0,2),topic))||0,pp=pop(code.slice(0,2));
  return {topic,index,local:{count,rate:count!==null&&p>0?count*10000/p:null},prefRate:pc!==null&&pp>0?pc*10000/pp:null};
 });
 return {code,name,pref,items};
});
writeFileSync(new URL('public/data.json',import.meta.url),JSON.stringify({years,asOf:batch.as_of,regions})+'\n');
console.log('regions:',regions.length,'bytes:',Buffer.byteLength(JSON.stringify(regions)));
