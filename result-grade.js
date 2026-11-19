function resultGradeFor(score) {
  if (!Number.isFinite(score)) return null;
  return score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : 'X';
}

function completedResultHeader(record, stats, grade, canReviewWrong) {
  const { score, total, correct, wrong, marked, accuracy, completion } = stats;
  const progress = studyLevelProgress(countAttempts());
  const asset = `assets/grades/grade_${grade}`;
  const sectionTitle = (number, title) => `<h2 class="grade-section-title"><span aria-hidden="true">${number}</span>${title}</h2>`;
  return `<header class="grade-result-heading"><h1>练习结算</h1><p>${esc(sessionTitle(record.mode))} · 进度已保存</p></header>
    <div class="grade-result-grid" data-grade="${grade}">
      <section class="grade-result-stage" aria-label="本轮评级 ${grade}" data-grade-background="neutral" style="--grade-ambient:url('${asset}_ambient.webp')">
        ${sectionTitle('02', '评级')}
        <div class="grade-player-slot" data-grade-player="${grade}" data-grade-round="${esc(record.id)}"></div>
        <div class="grade-stage-footer"><strong aria-label="评级 ${grade}">${grade} 评级</strong>
          <div class="grade-stage-controls">
            <button type="button" data-grade-replay>重播</button>
            <button type="button" data-grade-toggle aria-label="场景延展" aria-pressed="false">同色融合</button>
          </div>
        </div>
      </section>
      <section class="grade-result-card grade-result-score">
        ${sectionTitle('01', '成绩')}
        <div class="grade-score-main"><strong data-result-score="${score}" data-result-key="${esc(record.id)}-${record.updatedAt}-${record.status}">${score}</strong><span> / 100</span></div>
        <dl class="grade-result-facts">
          <div><dt>答对 / 总题数</dt><dd>${correct} / ${total}</dd></div>
          <div><dt>正确率</dt><dd>${accuracy === null ? '—' : accuracy + '%'}</dd></div>
          <div><dt>本轮用时</dt><dd>${record.timerCounters ? formatStudyTime(studyTimeMs(record)) : '—'}</dd></div>
          <div><dt>目标完成</dt><dd>${completion}%</dd></div>
        </dl>
        <p class="grade-score-thresholds">S ≥ 90 · A ≥ 80 · B ≥ 70<br>70 分以下为 X</p>
      </section>
      <section class="grade-result-card grade-result-reward">
        ${sectionTitle('03', '奖励与复习')}
        <div class="grade-learning"><span>练习等级</span><strong>${esc(progress.name)}</strong><small>累计作答 ${progress.total} 次</small>
          <progress value="${progress.total % 200}" max="200" aria-label="练习进度"></progress></div>
        <dl class="grade-result-facts"><div><dt>本轮错题</dt><dd>${wrong} 道</dd></div><div><dt>标记不会</dt><dd>${marked} 道</dd></div></dl>
        ${canReviewWrong ? reviewEntry(record, '查看本轮错题', 'single', 'wrong', 'grade-review-link') : `<p class="grade-review-note">${wrong ? '恢复原题库后可查看错题' : '本轮没有错题'}</p>`}
      </section>
    </div>`;
}

const TijianGradePlayer = (() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null;
  let background = 'neutral';

  function releaseVideo(player) {
    const video = player.video;
    if (!video) return;
    player.video = null;
    player.frame.classList.remove('is-playing');
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  function dispose() {
    if (!active) return;
    active.observer?.disconnect();
    releaseVideo(active);
    active = null;
  }

  function updatePlayback(player) {
    if (active !== player || !player.frame.isConnected) return;
    if (!player.manual && (!motionEnabled || reducedMotion.matches)) {
      releaseVideo(player);
      return;
    }
    if (!player.visible || document.hidden) {
      player.video?.pause();
      return;
    }
    if (player.failed) return;
    if (!player.video) {
      const video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = 'metadata';
      video.disablePictureInPicture = true;
      video.setAttribute('aria-hidden', 'true');
      player.video = video;
      const fallback = () => {
        if (player.video !== video) return;
        player.failed = true;
        releaseVideo(player);
      };
      video.addEventListener('error', fallback, { once: true });
      video.addEventListener('playing', () => {
        if (player.video === video) player.frame.classList.add('is-playing');
      });
      video.src = player.asset + '_scene.mp4';
      player.frame.append(video);
    }
    const video = player.video;
    video.play()?.catch(error => {
      if (player.video !== video || error.name === 'AbortError') return;
      player.failed = true;
      releaseVideo(player);
    });
  }

  function watchVisibility(player, stage) {
    player.observer?.disconnect();
    player.observer = new IntersectionObserver(([entry]) => {
      player.visible = entry.isIntersecting;
      updatePlayback(player);
    });
    player.observer.observe(stage);
  }

  function bind() {
    const slot = document.querySelector('[data-grade-player]');
    if (!slot) { dispose(); return; }
    const grade = slot.dataset.gradePlayer;
    const key = `${slot.dataset.gradeRound}:${grade}`;
    if (active?.key !== key) {
      dispose();
      const frame = document.createElement('div');
      frame.className = 'grade-video-frame';
      const asset = `assets/grades/grade_${grade}`;
      frame.innerHTML = `<span aria-hidden="true">${grade}</span><img src="${asset}_poster.jpg" alt="" decoding="async">`;
      const poster = frame.querySelector('img');
      poster.addEventListener('error', () => { poster.hidden = true; }, { once: true });
      active = { key, asset, frame, visible: false, manual: false, failed: false, video: null, observer: null };
    }
    const player = active;
    slot.append(player.frame);
    const stage = slot.closest('.grade-result-stage');
    const toggle = stage.querySelector('[data-grade-toggle]');
    const setBackground = () => {
      stage.dataset.gradeBackground = background;
      toggle.textContent = background === 'scene' ? '场景延展' : '同色融合';
      toggle.setAttribute('aria-pressed', String(background === 'scene'));
    };
    toggle.onclick = () => {
      background = background === 'scene' ? 'neutral' : 'scene';
      setBackground();
    };
    setBackground();
    const replay = stage.querySelector('[data-grade-replay]');
    replay.textContent = motionEnabled && !reducedMotion.matches ? '重播' : '播放动画';
    replay.onclick = () => {
      player.manual = true;
      player.failed = false;
      player.visible = true;
      if (player.video) player.video.currentTime = 0;
      updatePlayback(player);
    };
    watchVisibility(player, stage);
    if (!motionEnabled || reducedMotion.matches) updatePlayback(player);
  }

  document.addEventListener('visibilitychange', () => { if (active) updatePlayback(active); });
  window.addEventListener('pagehide', () => { if (active) releaseVideo(active); });
  window.addEventListener('pageshow', () => { if (active) updatePlayback(active); });
  reducedMotion.addEventListener('change', () => {
    if (!active) return;
    active.manual = false;
    const replay = active.frame.closest('.grade-result-stage')?.querySelector('[data-grade-replay]');
    if (replay) replay.textContent = motionEnabled && !reducedMotion.matches ? '重播' : '播放动画';
    updatePlayback(active);
  });

  return { bind };
})();
