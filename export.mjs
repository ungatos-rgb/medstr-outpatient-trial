// node export.mjs <product data directory>. Only public geographic aggregates leave the PC.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
const directory=process.argv[2];
if(!directory) throw Error('製品版の保存フォルダーを指定してください');
const open=name=>new DatabaseSync(join(directory,name+'.sqlite'),{readOnly:true});
const source=open('medical-strategy'), master=open('master-data-v2');
const topics=['内科系','小児科系','眼科系'];
const years=[2025,2030,2035,2040];
const codes=['43203','43101','43102','13115'];
const latest=source.prepare("select json from analysis_cache where view_name='estat' and json_extract(json,'$.regionCode')=? and json_array_length(json,'$.forecast')>0 order by created_at desc limit 1");
const inhabitants=source.prepare("select t.text sex,a.age_from lo,a.age_to hi,a.value n from age_profile a join age_profile_source s using(src_no) join age_text t on t.id=a.sex_id where family='ipss' and year=2025 and code=? and t.text in ('男','女') and a.age_from>=0 order by sex,lo");
function population(code){
  const cells=inhabitants.all(code);
  for(const sex of ['男','女']){
    const rows=cells.filter(r=>r.sex===sex);
    if(rows[0]?.lo!==0 || rows.at(-1)?.hi!==199 || rows.some((r,i)=>!(r.n>=0)||r.n===null||(i&&r.lo!==rows[i-1].hi+1)))return null;
  }
  return cells.reduce((sum,r)=>sum+r.n,0);
}
const batch=master.prepare("select batch_no,as_of,count(*) n from facility_row where type='診療所' group by batch_no,as_of order by as_of desc,n desc limit 1").get();
if(!batch || master.prepare("select value from metadata where key='specialty_index_診療所'").get()?.value!=='complete')throw Error('診療所一覧または診療科情報が未収集です');
const clinics=master.prepare("select r.city_code code,i.specialties_json labels from facility_row r left join facility_specialty_index i on i.facility_id=r.id and i.facility_type=r.type where r.type='診療所' and r.batch_no=? and r.as_of=?").all(batch.batch_no,batch.as_of);
const regions=codes.map(code=>{
  const report=JSON.parse(latest.get(code).json);
  if(new Set(report.baselines.map(b=>b.areaCode)).size!==1)throw Error('単一医療圏を確認してください '+code);
  const [pref,name]=report.region.trim().split(/\s+/);
  const prefecture=code.slice(0,2);
  function stats(area,topic){
    const values=clinics.filter(c=>c.code?.startsWith(area));
    if(!values.length||values.some(c=>c.labels===null))return {count:null,rate:null};
    const count=values.filter(c=>JSON.parse(c.labels).some(s=>s.normalize('NFKC').includes(topic.slice(0,-1)))).length;
    const pop=population(area);
    return {count,rate:pop>0?count*10000/pop:null};
  }
  const items=topics.map(topic=>{
    const totals=years.map(y=>report.forecast.find(r=>r.year===y)?.values.find(v=>v.specialty===topic)?.patients);
    return {topic,index:totals.map(v=>Number.isFinite(v)&&totals[0]>0?Math.round(1000*v/totals[0])/10:null),local:stats(code,topic),prefRate:stats(prefecture,topic).rate};
  });
  return {code,name,pref,items};
});
writeFileSync(new URL('public/data.json',import.meta.url),JSON.stringify({years,asOf:batch.as_of,regions},null,2)+'\n');
