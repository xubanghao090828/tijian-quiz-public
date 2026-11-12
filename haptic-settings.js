const HAPTIC_STYLES = [['off', '关闭'], ['single', '一下'], ['double', '两下'], ['triple', '三下']];
let hapticPreferences = loadHapticPreferences();
let hapticProtectedUntil = 0;
let hapticCapability = null;
let nativeQuizHaptics = null;

function loadHapticPreferences() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('tijian-haptic-preferences')); } catch {}
  return {
    strength: Number.isFinite(saved?.strength) ? Math.max(0, Math.min(100, saved.strength)) : 60,
    correct: HAPTIC_STYLES.some(([value]) => value === saved?.correct) ? saved.correct : 'single',
    wrong: HAPTIC_STYLES.some(([value]) => value === saved?.wrong) ? saved.wrong : 'double',
    tap: saved?.tap !== false
  };
}

function getQuizHaptics() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  if (!nativeQuizHaptics) nativeQuizHaptics = cap.Plugins?.QuizHaptics || cap.registerPlugin?.('QuizHaptics');
  return nativeQuizHaptics;
}

function hapticPattern(kind) {
  const style = kind === 'tap' ? (hapticPreferences.tap ? 'single' : 'off') : hapticPreferences[kind];
  const pulse = kind === 'tap' ? 12 : kind === 'correct' ? 18 : 28;
  if (style === 'off') return [];
  if (style === 'double') return [pulse, 75, pulse + 10];
  if (style === 'triple') return [pulse, 60, pulse, 60, pulse + 10];
  return [pulse];
}

function stopHaptics() {
  hapticProtectedUntil = 0;
  try { navigator.vibrate?.(0); } catch {}
  try { Promise.resolve(getQuizHaptics()?.stop()).catch(() => {}); } catch {}
}

function haptic(kind = 'tap') {
  if (!hapticsEnabled || !hapticPreferences.strength) return;
  if (kind === 'tap' && Date.now() < hapticProtectedUntil) return;
  const pattern = hapticPattern(kind);
  if (!pattern.length) return;
  const strength = Math.max(1, Math.round(hapticPreferences.strength * (kind === 'tap' ? .35 : kind === 'correct' ? .65 : 1)));
  if (kind !== 'tap') hapticProtectedUntil = Date.now() + pattern.reduce((sum, value) => sum + value, 0) + 45;
  const browserFallback = () => {
    const adjusted = pattern.map((value, i) => i % 2 ? value : Math.max(5, Math.round(value * (.5 + strength / 100))));
    try { navigator.vibrate?.(adjusted); } catch {}
  };
  const fallback = () => {
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) { browserFallback(); return; }
    try {
      const plugin = cap.Plugins?.Haptics || cap.registerPlugin?.('Haptics');
      Promise.resolve(plugin?.vibrate({ duration: pattern[0] })).catch(browserFallback);
    } catch { browserFallback(); }
  };
  try {
    const plugin = getQuizHaptics();
    if (!plugin) { browserFallback(); return; }
    Promise.resolve(plugin.play({ pattern, strength })).catch(fallback);
  } catch { fallback(); }
}

function hapticSettingsHtml() {
  const capability = hapticCapability?.available === false ? '这台设备没有可用的震动马达。'
    : hapticCapability?.amplitudeControl ? '已检测到安卓震动强度控制。'
    : '实际强度取决手机硬件。未支持强度控制的设备会通过时长和节奏适配，网页端主要支持节奏。';
  return `<section class="card settings-card haptic-custom">
    <div><h2>震动强度与节奏</h2><p>${capability}</p></div>
    <label for="haptic-strength">基础强度 <output id="haptic-strength-value">${hapticPreferences.strength}%</output></label>
    <input id="haptic-strength" type="range" min="0" max="100" step="5" value="${hapticPreferences.strength}" aria-label="震动基础强度">
    <p>答对反馈较轻，答错反馈更清晰。0% 不震动。</p>
    ${[['correct','答对'],['wrong','答错']].map(([kind,label]) => `
      <div class="haptic-pattern-row"><label for="haptic-pattern-${kind}">${label}节奏</label>
        <select id="haptic-pattern-${kind}" data-haptic-pattern="${kind}">${HAPTIC_STYLES.map(([value,name]) =>
          `<option value="${value}" ${hapticPreferences[kind] === value ? 'selected' : ''}>${name}</option>`).join('')}</select>
        <button class="secondary" data-haptic-test="${kind}" ${!hapticsEnabled || !hapticPreferences.strength || hapticPreferences[kind] === 'off' ? 'disabled' : ''}>试震</button></div>`).join('')}
    <div class="haptic-pattern-row"><span>切题轻震</span><button class="settings-switch" data-haptic-tap role="switch" aria-checked="${hapticPreferences.tap}">${hapticPreferences.tap ? '已开启' : '已关闭'}</button>
      <button class="secondary" data-haptic-test="tap" ${!hapticsEnabled || !hapticPreferences.strength || !hapticPreferences.tap ? 'disabled' : ''}>试震</button></div>
  </section>`;
}

function bindHapticSettings() {
  const savePreferences = () => localStorage.setItem('tijian-haptic-preferences', JSON.stringify(hapticPreferences));
  document.querySelector('#haptic-strength')?.addEventListener('input', event => {
    hapticPreferences.strength = Number(event.target.value);
    document.querySelector('#haptic-strength-value').textContent = hapticPreferences.strength + '%';
    savePreferences();
    if (!hapticPreferences.strength) stopHaptics();
  });
  document.querySelector('#haptic-strength')?.addEventListener('change', () => render());
  document.querySelectorAll('[data-haptic-pattern]').forEach(select => select.onchange = () => {
    hapticPreferences[select.dataset.hapticPattern] = select.value; savePreferences(); render();
  });
  document.querySelector('[data-haptic-tap]')?.addEventListener('click', () => {
    hapticPreferences.tap = !hapticPreferences.tap; savePreferences(); render();
  });
  document.querySelectorAll('[data-haptic-test]').forEach(button => button.onclick = () => haptic(button.dataset.hapticTest));
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const plugin = getQuizHaptics();
    if (!plugin) return;
    hapticCapability = await plugin.capabilities();
    if (view === 'settings') render();
  } catch {}
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopHaptics(); });
