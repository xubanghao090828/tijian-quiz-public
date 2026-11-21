(function(root){
  'use strict';
  const C=root.TijianStudyCore, V=root.TijianStudySchema, maxRows=10000, maxFile=8*1024*1024;
  const split=(value,re)=>[...new Set(value.split(re).map(s=>s.trim()).filter(Boolean))];
  const requirements={vocab:['en','zh'],questions:['question_id','stem'],points:['question_id','point_id','label','max_score','critical']};
  const optional={vocab:['id','pos','accepted_spellings','example','tags'],questions:['reference','rubric_version','tags','source'],points:['aliases','conditions','partial_rule']};
  const location=r=>(r.file||r.source)+' 第 '+r.line+' 行';
  const issue=(r,msg)=>location(r)+'：'+msg;
  function csvRows(text){
    const rows=[];let fields=[],field='',quoted=false,closed=false,line=1,start=1;
    const endField=()=>{fields.push(field);field='';closed=false};
    const endRow=()=>{endField();rows.push({cells:fields,line:start});fields=[];if(rows.length>maxRows+1)throw Error('表格超过 10,000 行，请拆成几个文件');};
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(quoted){
        if(c==='"'){if(n==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
        else if(c==='\r'||c==='\n'){field+='\n';if(c==='\r'&&n==='\n')i++;line++;}
        else field+=c;
      }else if(c===',')endField();
      else if(c==='\r'||c==='\n'){endRow();if(c==='\r'&&n==='\n')i++;start=++line;}
      else if(c==='"'&&!field&&!closed)quoted=true;
      else if(c==='"'||closed)throw Error(`第 ${line} 行引号格式不正确，请检查 CSV`);
      else field+=c;
    }
    if(quoted)throw Error(`第 ${start} 行的引号没有闭合`);
    if(field||fields.length||closed)endRow();
    return rows;
  }
  async function sheets(files){
    const tables=[];
    for(const file of files){
      if(!file.size||file.size>maxFile)throw Error(file.name+'：文件为空或超过 8 MB');
      if(/\.csv$/i.test(file.name)){
        try {
          const bytes=await file.arrayBuffer();
          const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
          tables.push({source:file.name,rows:csvRows(text)});
        } catch(e){throw Error(file.name+'：'+e.message+'；请用 UTF-8 CSV 或 Excel 另存后重试');}
      }else if(/\.xlsx$/i.test(file.name)){
        const book=root.XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:maxRows+2});
        if(book.SheetNames.length>12)throw Error(file.name+'：最多读取 12 个工作表');
        for(const name of book.SheetNames){
          const sheet=book.Sheets[name]; if(!sheet['!ref'])continue;
          const bounds=root.XLSX.utils.decode_range(sheet['!ref']);
          if(bounds.e.r>=maxRows+1||bounds.e.c>=64)throw Error(name+'：超过处理范围，请拆分表格或移除无关列');
          const rows=root.XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true});
          tables.push({source:file.name+' / '+name,rows:rows.map((cells,i)=>({cells,line:bounds.s.r+i+1}))});
        }
      }else throw Error('请选择 UTF-8 CSV 或 .xlsx 文件');
    }
    return tables;
  }
  function mapRows(table,type,mapping,errors,warnings){
    const [header,...body]=table.rows.filter(row=>row.cells.some(c=>String(c??'').trim()));
    if(!header)return [];
    const names=header.cells.map(c=>String(c??'').trim());
    if(new Set(names.filter(Boolean)).size!==names.filter(Boolean).length){errors.push(issue({...header,source:table.source},'表头重复，请给每列唯一名称'));return [];}
    const index={};for(const k of [...requirements[type],...optional[type]])index[k]=names.indexOf(mapping?.[k]??k);
    const missing=requirements[type].filter(k=>index[k]<0);
    if(missing.length){errors.push(issue({...header,source:table.source},'缺列 '+missing.join('、')+'；请按模板改表头或调整字段映射'));return [];}
    const unknown=names.filter((n,i)=>n&&!Object.values(index).includes(i));
    if(unknown.length)warnings.push(table.source+'：未使用列 '+unknown.join('、'));
    const out=[];
    for(const r of body){
      const row={file:table.source,line:r.line};
      if(r.cells.slice(names.length).some(x=>String(x??'').trim())){errors.push(issue(row,'数据多于表头列数，请检查逗号或引号'));continue;}
      for(const [k,i] of Object.entries(index))row[k]=String(r.cells[i]??'').trim();
      if(Object.keys(index).some(k=>row[k].length>12000)){errors.push(issue(row,'单格超过 12,000 字，请拆分内容'));continue;}
      out.push(row);
    }
    return out;
  }
  function preview(tables,kind,existing,{mapping={},duplicate='skip'}={}){
    const errors=[],warnings=[],items=[];
    const get=(t,k)=>mapRows(t,k,mapping[t.source],errors,warnings);
    const seen=new Map(),key=(x)=>C.normalizeEn(x.en);
    if(kind==='vocab'){
      const old=existing.filter(x=>x.module==='vocab'), present=new Map(), byExternal=new Map();
      for(const x of old){if(!present.has(key(x)))present.set(key(x),x);if(x.externalId)byExternal.set(x.externalId,x);}
      for(const t of tables)for(const r of get(t,'vocab')){
        const zh=split(r.zh,/[；;|]/);
        if(!r.en||!zh.length){errors.push(issue(r,'英文和中文释义必填'));continue;}
        const item={id:C.uuid(),module:'vocab',externalId:r.id,version:1,en:r.en,zh,pos:r.pos,spellings:split(r.accepted_spellings,/\|/),example:r.example,tags:split(r.tags,/[；;|]/)};
        if(!V.item(item)){errors.push(issue(r,'词条内容过长或字段格式不受支持'));continue;}
        if(r.id&&seen.has(r.id)){
          const before=seen.get(r.id);
          if(JSON.stringify({...before,id:null})!==JSON.stringify({...item,id:null}))errors.push(issue(r,'同一词表 ID 对应不同内容，请修改 ID'));
          else warnings.push(issue(r,'重复 ID，已跳过'));
          continue;
        }
        if(r.id)seen.set(r.id,item);
        const byId=r.id&&byExternal.get(r.id);
        if(byId&&(key(byId)!==key(item)||JSON.stringify(byId.zh)!==JSON.stringify(item.zh)||JSON.stringify(byId.spellings)!==JSON.stringify(item.spellings))){
          errors.push(issue(r,'该 ID 已被不同词条使用；请修正 ID 或留空后重新预览'));continue;
        }
        const match=byId||present.get(key(item));
        if(match&&(byId||duplicate!=='separate')){
          if(!byId&&duplicate==='merge'){
            const base=items.find(x=>x.id===match.id)||match;
            const merged={...base,zh:[...new Set([...base.zh,...item.zh])],spellings:[...new Set([...base.spellings,...item.spellings])],version:base.version+(old.some(x=>x.id===base.id)&&!items.some(x=>x.id===base.id)?1:0),replace:old.some(x=>x.id===base.id)};
            const i=items.findIndex(x=>x.id===base.id);if(i<0)items.push(merged);else items[i]=merged;present.set(key(item),merged);
            warnings.push(issue(r,'词条重复：合并可接受释义和拼写'));
          }else warnings.push(issue(r,'词条重复：跳过，原进度保留'));
          continue;
        }
        items.push(item);present.set(key(item),present.get(key(item))||item);
      }
    }else{
      const byId=new Map(), byQuestion=new Map();
      for(const t of tables){
        const header=t.rows.find(r=>r.cells.some(c=>String(c??'').trim()))?.cells.map(c=>String(c).trim())||[];
        const field=mapping[t.source]?.point_id||'point_id';
        const type=t.type||(header.includes(field)?'points':'questions');
        for(const r of get(t,type)){
          if(type==='questions'){
            if(!r.question_id||!r.stem){errors.push(issue(r,'题号和题干必填'));continue;}
            if(byId.has(r.question_id)){errors.push(issue(r,'题目 ID 重复'));continue;}
            if(r.rubric_version&&!/^[1-9]\d{0,7}$/.test(r.rubric_version)){errors.push(issue(r,'评分版本需为正整数'));continue;}
            byId.set(r.question_id,r);
          }else{
            if(!r.question_id||!r.point_id||!r.label||!/^\d+(?:\.\d{1,2})?$/.test(r.max_score)||+r.max_score>10000||!/^(true|false)$/i.test(r.critical)){
              errors.push(issue(r,'题号、点号、名称、有效分值与 true/false 关键标记必填'));continue;
            }
            if(['__proto__','prototype','constructor'].includes(r.point_id)){errors.push(issue(r,'请更换该得分点 ID'));continue;}
            const points=byQuestion.get(r.question_id)||new Map();
            if(points.has(r.point_id)){errors.push(issue(r,'同一道题的得分点 ID 重复'));continue;}
            points.set(r.point_id,{pointId:r.point_id,label:r.label,maxScore:+r.max_score,critical:r.critical.toLowerCase()==='true',aliases:split(r.aliases,/\|/),conditions:r.conditions,partialRule:r.partial_rule,row:r});
            byQuestion.set(r.question_id,points);
          }
        }
      }
      for(const [id,points] of byQuestion)if(!byId.has(id))for(const p of points.values())errors.push(issue(p.row,'在题目表找不到题目 '+id));
      const old=new Map(existing.filter(x=>x.module==='short').map(x=>[x.externalId,x]));
      for(const [externalId,r] of byId){
        const points=[...(byQuestion.get(externalId)?.values()||[])].map(({row,...p})=>p);
        if(points.length>50){errors.push(issue(r,'每道题最多 50 个得分点'));continue;}
        const ready=Boolean(r.reference&&points.some(p=>p.maxScore>0));
        if(!ready)warnings.push(issue(r,'缺少参考答案或有效得分点，将存为待完善草稿'));
        const rubricVersion=Number(r.rubric_version||1),latest=old.get(externalId);
        const item={id:latest?.id||C.uuid(),module:'short',externalId,rubricVersion,stem:r.stem,reference:r.reference,tags:split(r.tags,/[；;|]/),source:r.source,points,ready};
        if(!V.item(item)){errors.push(issue(r,'题目或得分点字段过长或格式不受支持'));continue;}
        if(latest){
          const same=JSON.stringify([latest.stem,latest.reference,latest.points])===JSON.stringify([item.stem,item.reference,item.points]);
          if(same&&latest.rubricVersion>=rubricVersion){warnings.push(issue(r,'同版题目已存在，已跳过'));continue;}
          if(rubricVersion<=latest.rubricVersion){errors.push(issue(r,'内容与现有版本冲突，请提高 rubric_version 或调整题号'));continue;}
          if(!ready&&latest.ready){errors.push(issue(r,'待完善草稿不能替换正式题目，请补齐后再导入'));continue;}
          item.replace=true;
        }
        items.push(item);
      }
    }
    return {items,errors,warnings};
  }
  root.TijianStudyImport={sheets,preview,requirements,optional};
})(globalThis);
