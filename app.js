/**
 * 健身組間休息計時器 (Gym Rest Interval Timer)
 */

class RestTimer {
  constructor() {
    // 狀態設定
    this.totalDuration = 60; // 預設 60 秒
    this.remainingSeconds = 60;
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'finished'
    this.setCount = 0;
    this.soundEnabled = true;
    this.wakeLock = null;
    this.timerInterval = null;
    this.endTime = null;

    // 音效 Web Audio Context
    this.audioCtx = null;

    // SVG 環形進度條參數 (r=140)
    this.circumference = 2 * Math.PI * 140;

    // DOM 元素快取
    this.initDOMElements();

    // 初始化事件監聽
    this.bindEvents();

    // 初始化渲染
    this.initProgressRing();
    this.updateDisplay();
  }

  initDOMElements() {
    this.progressCircle = document.getElementById('progressCircle');
    this.timerSection = document.querySelector('.timer-section');
    this.timeText = document.getElementById('timeText');
    this.statusLabel = document.getElementById('statusLabel');
    this.setCountEl = document.getElementById('setCount');

    this.startPauseBtn = document.getElementById('startPauseBtn');
    this.startPauseText = document.getElementById('startPauseText');
    this.playIcon = document.getElementById('playIcon');
    this.pauseIcon = document.getElementById('pauseIcon');
    this.resetBtn = document.getElementById('resetBtn');
    this.nextSetBtn = document.getElementById('nextSetBtn');

    this.presetButtons = document.querySelectorAll('.preset-btn');
    this.btnMinus15 = document.getElementById('btnMinus15');
    this.btnPlus15 = document.getElementById('btnPlus15');

    this.soundToggleBtn = document.getElementById('soundToggleBtn');
    this.soundOnIcon = document.getElementById('soundOnIcon');
    this.soundOffIcon = document.getElementById('soundOffIcon');
    this.wakeLockBtn = document.getElementById('wakeLockBtn');
  }

  initProgressRing() {
    this.progressCircle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
    this.progressCircle.style.strokeDashoffset = '0';
  }

  bindEvents() {
    // 主控制鈕
    this.startPauseBtn.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      this.toggleStartPause();
    });

    this.resetBtn.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      this.reset();
    });

    this.nextSetBtn.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      this.completeSetAndRestart();
    });

    // 快速預設按鈕 (30s, 60s, 90s)
    this.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.ensureAudioUnlocked();
        const duration = parseInt(btn.dataset.time, 10);
        this.setPreset(duration);
      });
    });

    // 時間微調按鈕
    this.btnMinus15.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      this.adjustTime(-15);
    });

    this.btnPlus15.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      this.adjustTime(15);
    });

    // 音效開關
    this.soundToggleBtn.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      this.toggleSound();
    });

    // 螢幕常亮開關
    this.wakeLockBtn.addEventListener('click', () => {
      this.toggleWakeLock();
    });

    // 鍵盤快捷鍵 (空白鍵開始/暫停，R 重置)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.ensureAudioUnlocked();
        this.toggleStartPause();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.ensureAudioUnlocked();
        this.reset();
      }
    });

    // 頁面可見度切換時重新請求 WakeLock
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wakeLock !== null) {
        this.requestWakeLock();
      }
    });
  }

  // ===== 音訊處理 (Web Audio API) =====
  ensureAudioUnlocked() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (this.soundEnabled) {
      this.soundOnIcon.classList.remove('hidden');
      this.soundOffIcon.classList.add('hidden');
      this.playTickSound(880, 0.1);
    } else {
      this.soundOnIcon.classList.add('hidden');
      this.soundOffIcon.classList.remove('hidden');
    }
  }

  playTone(freq, duration, type = 'sine', gainLevel = 0.2, startTime = 0) {
    if (!this.soundEnabled || !this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + startTime);

      const t = this.audioCtx.currentTime + startTime;
      gainNode.gain.setValueAtTime(0.001, t);
      gainNode.gain.exponentialRampToValueAtTime(gainLevel, t + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }

  playTickSound(freq = 520, duration = 0.08) {
    this.playTone(freq, duration, 'sine', 0.15);
  }

  playFinishAlarm() {
    if (!this.soundEnabled) return;
    this.ensureAudioUnlocked();

    const notes = [
      { freq: 659.25, time: 0, dur: 0.14 },    // E5
      { freq: 880.00, time: 0.14, dur: 0.14 }, // A5
      { freq: 1318.51, time: 0.28, dur: 0.45 } // E6
    ];

    notes.forEach(n => {
      this.playTone(n.freq, n.dur, 'triangle', 0.35, n.time);
    });

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 450]);
      } catch (e) {
        // 忽略未支援
      }
    }
  }

  // ===== 螢幕常亮 (Screen Wake Lock) =====
  async toggleWakeLock() {
    if (!('wakeLock' in navigator)) {
      alert('您的瀏覽器不支援螢幕常亮功能');
      return;
    }

    if (this.wakeLock) {
      await this.releaseWakeLock();
    } else {
      await this.requestWakeLock();
    }
  }

  async requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLockBtn.classList.add('active');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
        this.wakeLockBtn.classList.remove('active');
      });
    } catch (err) {
      console.log('Wake Lock Error:', err);
      this.wakeLockBtn.classList.remove('active');
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
      this.wakeLockBtn.classList.remove('active');
    }
  }

  // ===== 計時邏輯 =====
  setPreset(seconds) {
    this.totalDuration = seconds;
    this.remainingSeconds = seconds;
    this.status = 'idle';
    this.stopTimer();

    this.presetButtons.forEach(btn => {
      const match = parseInt(btn.dataset.time, 10) === seconds;
      btn.classList.toggle('active', match);
    });

    this.timerSection.classList.remove('warning', 'finished');
    this.updateDisplay();
    this.updateControlsUI();
  }

  toggleStartPause() {
    if (this.status === 'running') {
      this.pause();
    } else if (this.status === 'finished') {
      this.remainingSeconds = this.totalDuration;
      this.start();
    } else {
      this.start();
    }
  }

  start() {
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = this.totalDuration;
    }

    this.status = 'running';
    this.endTime = Date.now() + this.remainingSeconds * 1000;

    if ('wakeLock' in navigator && !this.wakeLock) {
      this.requestWakeLock();
    }

    this.timerSection.classList.remove('finished');
    this.updateControlsUI();
    this.updateDisplay();

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 200);
  }

  pause() {
    this.status = 'paused';
    this.stopTimer();
    this.updateControlsUI();
    this.updateDisplay();
  }

  reset() {
    this.status = 'idle';
    this.stopTimer();
    this.remainingSeconds = this.totalDuration;
    this.timerSection.classList.remove('warning', 'finished');
    this.updateControlsUI();
    this.updateDisplay();
  }

  completeSetAndRestart() {
    this.setCount += 1;
    this.setCountEl.textContent = this.setCount;
    this.reset();
    this.start();
  }

  adjustTime(deltaSeconds) {
    let newTime = this.remainingSeconds + deltaSeconds;
    if (newTime < 1) newTime = 1;
    this.remainingSeconds = newTime;

    if (this.status === 'running') {
      this.endTime = Date.now() + this.remainingSeconds * 1000;
    }

    if (this.remainingSeconds > this.totalDuration) {
      this.totalDuration = this.remainingSeconds;
    }

    this.timerSection.classList.remove('finished');
    this.updateDisplay();
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  tick() {
    const now = Date.now();
    const diffMs = this.endTime - now;
    const remaining = Math.ceil(diffMs / 1000);

    if (remaining !== this.remainingSeconds && remaining > 0) {
      this.remainingSeconds = remaining;

      if (this.remainingSeconds <= 3 && this.remainingSeconds > 0) {
        this.playTickSound(600, 0.08);
      }
    }

    if (diffMs <= 0) {
      this.remainingSeconds = 0;
      this.status = 'finished';
      this.stopTimer();
      this.playFinishAlarm();
      this.timerSection.classList.add('finished');
      this.updateControlsUI();
    }

    this.updateDisplay();
  }

  // ===== 畫面渲染 =====
  updateDisplay() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    this.timeText.textContent = formatted;

    document.title = this.status === 'running' 
      ? `(${formatted}) 休息計時中 | Rest Timer`
      : '健身組間休息計時器 | Rest Timer';

    if (this.status === 'running') {
      this.statusLabel.textContent = 'RESTING';
      this.statusLabel.style.color = 'var(--accent-color)';
    } else if (this.status === 'paused') {
      this.statusLabel.textContent = 'PAUSED';
      this.statusLabel.style.color = 'var(--accent-warning)';
    } else if (this.status === 'finished') {
      this.statusLabel.textContent = "TIME'S UP!";
      this.statusLabel.style.color = 'var(--accent-danger)';
    } else {
      this.statusLabel.textContent = 'READY';
      this.statusLabel.style.color = 'var(--text-muted)';
    }

    if (this.status === 'running' && this.remainingSeconds <= 5 && this.remainingSeconds > 0) {
      this.timerSection.classList.add('warning');
    } else if (this.status !== 'finished') {
      this.timerSection.classList.remove('warning');
    }

    const progress = this.totalDuration > 0 
      ? Math.max(0, Math.min(1, this.remainingSeconds / this.totalDuration))
      : 0;

    const offset = this.circumference * (1 - progress);
    this.progressCircle.style.strokeDashoffset = offset;
  }

  updateControlsUI() {
    if (this.status === 'running') {
      this.startPauseText.textContent = '暫停';
      this.playIcon.classList.add('hidden');
      this.pauseIcon.classList.remove('hidden');
      this.startPauseBtn.classList.add('running');
    } else if (this.status === 'finished') {
      this.startPauseText.textContent = '再來一組';
      this.playIcon.classList.remove('hidden');
      this.pauseIcon.classList.add('hidden');
      this.startPauseBtn.classList.remove('running');
    } else {
      this.startPauseText.textContent = '開始';
      this.playIcon.classList.remove('hidden');
      this.pauseIcon.classList.add('hidden');
      this.startPauseBtn.classList.remove('running');
    }
  }
}

/**
 * 今日訓練清單 (Today's Workout Tracker)
 * 支援新增動作、重量、組數，打勾完成，並持久化至 LocalStorage
 */
class WorkoutTracker {
  constructor(timerInstance) {
    this.timer = timerInstance;
    this.storageKey = 'gym_rest_timer_workout_items';
    this.workouts = [];

    this.initDOMElements();
    this.bindEvents();
    this.loadWorkouts();
    this.render();
  }

  initDOMElements() {
    this.workoutForm = document.getElementById('workoutForm');
    this.exerciseNameInput = document.getElementById('exerciseName');
    this.exerciseWeightInput = document.getElementById('exerciseWeight');
    this.exerciseSetsInput = document.getElementById('exerciseSets');
    this.workoutList = document.getElementById('workoutList');
    this.workoutEmptyState = document.getElementById('workoutEmptyState');
    this.progressBadge = document.getElementById('workoutProgressBadge');
    this.clearCompletedBtn = document.getElementById('clearCompletedBtn');
  }

  bindEvents() {
    // 提交新動作表單
    this.workoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addExercise();
    });

    // 清除已完成動作
    this.clearCompletedBtn.addEventListener('click', () => {
      this.clearCompleted();
    });
  }

  loadWorkouts() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        this.workouts = JSON.parse(data);
      } else {
        // 預設示範項目（首次開啟時提供參考）
        this.workouts = [
          {
            id: 'demo-1',
            name: '槓鈴深蹲 (Barbell Squat)',
            weight: '80 kg',
            sets: '4 組 / 8 下',
            completed: false,
            createdAt: Date.now()
          },
          {
            id: 'demo-2',
            name: '臥推 (Bench Press)',
            weight: '60 kg',
            sets: '4 組 / 10 下',
            completed: false,
            createdAt: Date.now() + 1
          }
        ];
        this.saveWorkouts();
      }
    } catch (err) {
      console.warn('載入 LocalStorage 失敗:', err);
      this.workouts = [];
    }
  }

  saveWorkouts() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.workouts));
    } catch (err) {
      console.warn('儲存至 LocalStorage 失敗:', err);
    }
  }

  addExercise() {
    const name = this.exerciseNameInput.value.trim();
    const weight = this.exerciseWeightInput.value.trim();
    const sets = this.exerciseSetsInput.value.trim();

    if (!name) return;

    const newExercise = {
      id: 'ex-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      name,
      weight: weight || '',
      sets: sets || '',
      completed: false,
      createdAt: Date.now()
    };

    this.workouts.push(newExercise);
    this.saveWorkouts();
    this.render();

    // 清空輸入框並聚焦動作名稱
    this.exerciseNameInput.value = '';
    this.exerciseWeightInput.value = '';
    this.exerciseSetsInput.value = '';
    this.exerciseNameInput.focus();

    // 播放輕微觸感音效
    if (this.timer) {
      this.timer.playTickSound(800, 0.05);
    }
  }

  toggleExercise(id) {
    const item = this.workouts.find(w => w.id === id);
    if (!item) return;

    item.completed = !item.completed;
    this.saveWorkouts();
    this.render();

    // 打勾時播放完成音
    if (item.completed && this.timer) {
      this.timer.playTone(880, 0.08, 'sine', 0.2);
    }
  }

  deleteExercise(id) {
    this.workouts = this.workouts.filter(w => w.id !== id);
    this.saveWorkouts();
    this.render();
  }

  clearCompleted() {
    const completedCount = this.workouts.filter(w => w.completed).length;
    if (completedCount === 0) return;

    this.workouts = this.workouts.filter(w => !w.completed);
    this.saveWorkouts();
    this.render();
  }

  render() {
    const total = this.workouts.length;
    const completedCount = this.workouts.filter(w => w.completed).length;

    // 更新進度徽章
    this.progressBadge.textContent = `${completedCount}/${total} 完成`;

    // 判斷空狀態
    if (total === 0) {
      this.workoutEmptyState.classList.remove('hidden');
      this.clearCompletedBtn.classList.add('hidden');
    } else {
      this.workoutEmptyState.classList.add('hidden');
      this.clearCompletedBtn.classList.toggle('hidden', completedCount === 0);
    }

    // 清空現有清單
    this.workoutList.innerHTML = '';

    // 渲染每個動作項目
    this.workouts.forEach(item => {
      const li = document.createElement('li');
      li.className = `workout-item ${item.completed ? 'completed' : ''}`;

      // 左側點擊切換完成區
      const leftDiv = document.createElement('div');
      leftDiv.className = 'item-left';
      leftDiv.addEventListener('click', () => this.toggleExercise(item.id));

      // 圓形打勾按鈕
      const checkboxBtn = document.createElement('button');
      checkboxBtn.type = 'button';
      checkboxBtn.className = 'checkbox-btn';
      checkboxBtn.setAttribute('aria-label', item.completed ? '標記為未完成' : '標記為已完成');
      checkboxBtn.innerHTML = `
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;

      // 項目資訊
      const infoDiv = document.createElement('div');
      infoDiv.className = 'item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = item.name;
      infoDiv.appendChild(nameSpan);

      // 標籤 (重量、組數)
      if (item.weight || item.sets) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'item-tags';

        if (item.weight) {
          const weightTag = document.createElement('span');
          weightTag.className = 'item-tag';
          weightTag.textContent = item.weight;
          tagsDiv.appendChild(weightTag);
        }

        if (item.sets) {
          const setsTag = document.createElement('span');
          setsTag.className = 'item-tag';
          setsTag.textContent = item.sets;
          tagsDiv.appendChild(setsTag);
        }

        infoDiv.appendChild(tagsDiv);
      }

      leftDiv.appendChild(checkboxBtn);
      leftDiv.appendChild(infoDiv);

      // 刪除按鈕
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'item-delete-btn';
      deleteBtn.title = '刪除動作';
      deleteBtn.setAttribute('aria-label', '刪除動作');
      deleteBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteExercise(item.id);
      });

      li.appendChild(leftDiv);
      li.appendChild(deleteBtn);

      this.workoutList.appendChild(li);
    });
  }
}

// 頁面載入完成後初始化
window.addEventListener('DOMContentLoaded', () => {
  const restTimer = new RestTimer();
  window.restTimer = restTimer;
  window.workoutTracker = new WorkoutTracker(restTimer);
});
