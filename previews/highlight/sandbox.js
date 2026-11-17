(() => {
  'use strict';
  // Only this preview window sees these aliases. Other tabs and real study data are untouched.
  const prefix = 'tijian-original-highlight-preview::';
  const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
  const appearance = ['tijian-font-family', 'tijian-font-size', 'tijian-motion', 'tijian-haptics'];
  for (const key of appearance) {
    const value = get.call(localStorage, key);
    if (value !== null && get.call(localStorage, prefix + key) === null) set.call(localStorage, prefix + key, value);
  }
  Storage.prototype.getItem = function(key) { return get.call(this, prefix + key); };
  Storage.prototype.setItem = function(key, value) { return set.call(this, prefix + key, value); };
  Storage.prototype.removeItem = function(key) { return remove.call(this, prefix + key); };
  window.TijianSync = {
    sync: async () => {}, bind() {},
    rememberAnswer(record, index, answer) { record.answerVariants ||= {}; record.answerVariants[index] = [{ answer, at: Date.now(), deviceId: window.TIJIAN_PROFILE.deviceId }]; },
    record(questionId, kind, total, correct, mistakeAction, mistakeMode, memoryRating) {
      state.events ||= [];
      state.events.push({ id: crypto.randomUUID(), deviceId: window.TIJIAN_PROFILE.deviceId, questionId, kind, total, correct, mistakeAction, mistakeMode, memoryRating, createdAt: Date.now() });
      rebuildMemoryCards(); save();
    },
    viewHtml: () => '<section class="card panel"><h1>高亮预览</h1><p>此预览使用独立本机记录。正式刷题记录与同步保持原状。</p><button class="primary" data-go="practice">返回刷题预览</button></section>'
  };
})();
