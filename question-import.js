(function (root) {
  const letters = 'ABCDEFGH';
  const text = value => String(value ?? '').trim();
  const key = value => text(value).normalize('NFKC').toLowerCase().replace(/[\s_-]/g, '');
  const questionKeys = ['题目', '题干', '问题', '题目内容', 'question', 'questionText', 'prompt', 'text', 'stem'];
  const answerKeys = ['答案', '正确答案', '参考答案', 'answer', 'correctAnswer', 'correct', 'answerIndex'];
  const truth = value => {
    const token = key(value);
    if (['正确', '对', '是', 'true', 't', '√', '✓', '对的'].includes(token)) return 0;
    if (['错误', '错', '否', 'false', 'f', '×', '✗', '错的'].includes(token)) return 1;
    return -1;
  };

  function normalize(row, isJSON) {
    if (!row || typeof row !== 'object') throw Error('题目须为一组字段');
    const fields = new Map(Object.entries(row).map(([name, value]) => [key(name), value]));
    const get = (...names) => names.map(name => fields.get(key(name))).find(value => text(value) !== '');
    const question = text(get(...questionKeys));
    if (!question) throw Error('缺少题干');
    const declared = key(get('题型', '类型', 'type', 'questionType'));
    if (/多选|multiple|multi|填空|简答|essay/.test(declared)) throw Error('目前仅支持单选题和判断题');
    const rawAnswer = get(...answerKeys);
    if (text(rawAnswer) === '') throw Error('缺少答案');
    const combined = get('选项', 'options', 'choices', 'alternatives');
    const optionFields = [...letters].map((letter, i) => get(letter, '选项' + letter, '选项' + (i + 1), 'option' + letter, 'option' + (i + 1)));
    if (Array.isArray(combined)) combined.forEach((value, i) => { optionFields[i] = value; });
    else if (combined && typeof combined === 'object') {
      for (const [label, value] of Object.entries(combined)) {
        const i = letters.indexOf(text(label).toUpperCase());
        if (i >= 0 && text(label).length === 1) optionFields[i] = value;
      }
    } else if (text(combined)) {
      const parts = text(combined).split(/[|｜;；\n]/);
      parts.forEach((part, i) => {
        const label = part.trim().match(/^([A-H])[.、．:：)）]\s*(.*)$/i);
        optionFields[label ? letters.indexOf(label[1].toUpperCase()) : i] = label ? label[2] : part;
      });
    }
    const declaredTruth = ['判断', '判断题', 'truefalse', 'boolean', 'tf'].includes(declared);
    if (optionFields.filter(value => text(value)).length < 2 && (declaredTruth || truth(rawAnswer) >= 0)) {
      optionFields[0] = '正确';
      optionFields[1] = '错误';
    }
    const indexed = optionFields.map((value, i) => ({ value: text(value), i })).filter(option => option.value);
    if (indexed.length < 2 || indexed.length > letters.length) throw Error('需要 2 至 8 个选项');
    if (Array.isArray(rawAnswer)) throw Error('答案须为单个选项');
    const answerText = text(rawAnswer).normalize('NFKC');
    const label = answerText.match(/^([A-H])(?:[.、:)].*)?$/i);
    const zeroBased = Number.isInteger(rawAnswer) && isJSON && Array.isArray(combined) || get('answerIndex') === rawAnswer && fields.has('answerindex');
    let answer = zeroBased ? indexed.findIndex(option => option.i === Number(rawAnswer)) : indexed.findIndex(option => option.value === text(rawAnswer));
    if (answer < 0 && !zeroBased && label) answer = indexed.findIndex(option => option.i === letters.indexOf(label[1].toUpperCase()));
    if (answer < 0 && !zeroBased && /^[1-8]$/.test(answerText)) answer = indexed.findIndex(option => option.i === Number(answerText) - 1);
    if (answer < 0 && truth(rawAnswer) >= 0) answer = indexed.findIndex(option => truth(option.value) === truth(rawAnswer));
    if (answer < 0) throw Error('答案与选项对不上');
    const options = indexed.map(option => option.value);
    const type = declaredTruth || (options.length === 2 && new Set(options.map(truth)).size === 2 && options.every(option => truth(option) >= 0)) ? '判断题' : '单选题';
    if (type === '判断题' && options.length !== 2) throw Error('判断题须有两个选项');
    const suppliedNotes = get('optionExplanations');
    const notes = indexed.map(({ i }) => text(Array.isArray(suppliedNotes) ? suppliedNotes[i] : get('选项' + letters[i] + '解析')));
    return {
      question, options, answer, type,
      category: text(get('分类', '科目', '章节', '知识点', 'category', 'topic')) || '我的题库',
      explanation: text(get('整体解析', '解析', '答案解析', '解释', 'explanation', 'rationale')),
      ...(notes.every(Boolean) ? { optionExplanations: notes } : {}),
      ...(get('待核查', 'reviewNote') ? { reviewNote: text(get('待核查', 'reviewNote')) } : {})
    };
  }

  function parse(source, format, xlsx, parseNative) {
    const items = [], issues = [];
    function add(row, location) {
      try { items.push(normalize(row, format === 'json')); }
      catch (error) { issues.push(location + '：' + error.message); }
    }
    if (format === 'json') {
      const data = JSON.parse(source.replace(/^\uFEFF/, ''));
      const rows = Array.isArray(data) ? data : data?.questions ?? data?.items;
      if (!Array.isArray(rows)) throw Error('JSON 需要题目数组，或包含 questions / items 数组');
      rows.forEach((row, i) => add(row, '第 ' + (i + 1) + ' 题'));
    } else if (format === 'txt') {
      let row = {}, start = 0;
      const flush = () => {
        if (Object.keys(row).length) add(row, '第 ' + start + ' 行');
        row = {};
      };
      source.split(/\r?\n/).forEach((line, i) => {
        const value = text(line);
        if (!value) { if (row.answer) flush(); return; }
        const option = value.match(/^([A-H])[.、．:：)）]\s*(.+)$/i);
        const field = value.match(/^(答案|正确答案|answer|解析|explanation|分类|category)\s*[:：]\s*(.*)$/i);
        if (option || field) {
          if (!Object.keys(row).length) start = i + 1;
          row[(option || field)[1]] = (option || field)[2];
          if (field && /^(答案|正确答案|answer)$/i.test(field[1])) row.answer = field[2];
          return;
        }
        if (row.answer || /^\d+[.、．)）]\s*/.test(value)) flush();
        if (!Object.keys(row).length) start = i + 1;
        row.question = [row.question, value.replace(/^\d+[.、．)）]\s*/, '')].filter(Boolean).join('\n');
      });
      flush();
    } else {
      const delimited = format === 'csv' || format === 'tsv';
      if (delimited && typeof source !== 'string') {
        try { source = new TextDecoder('utf-8', { fatal: true }).decode(source); }
        catch { source = new TextDecoder('gb18030').decode(source); }
      }
      const readOptions = delimited ? { type: 'string', raw: true } : { type: 'array' };
      if (format === 'tsv') readOptions.FS = '\t';
      const book = xlsx.read(source, readOptions);
      for (const name of book.SheetNames) {
        const rows = xlsx.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', blankrows: true, raw: false });
        if (!rows.some(row => row.some(value => text(value)))) continue;
        const native = rows.findIndex(row => key(row[2]) === key('正确答案(A)') && row.length >= 12);
        if (native >= 0) {
          const valid = parseNative(rows, name);
          items.push(...valid);
          const recognized = new Set(valid.map(item => item.id));
          rows.forEach((row, i) => {
            if (i > native && text(row[1]) && !recognized.has('u-' + name + '-' + i)) issues.push(name + ' 第 ' + (i + 1) + ' 行：题型、选项或答案无法识别');
          });
          continue;
        }
        const header = rows.findIndex(row => row.some(value => questionKeys.some(name => key(value) === key(name))) && row.some(value => answerKeys.some(name => key(value) === key(name))));
        if (header < 0) { issues.push(name + '：未找到含题干和答案的表头'); continue; }
        rows.slice(header + 1).forEach((row, i) => {
          if (row.some(value => text(value))) {
            add(Object.fromEntries(rows[header].map((column, j) => [column, row[j]])), name + ' 第 ' + (header + i + 2) + ' 行');
          }
        });
      }
    }
    return { items, issues };
  }

  root.TijianQuestionImport = { parse };
})(globalThis);
