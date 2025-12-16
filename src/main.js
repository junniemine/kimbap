    // Day별 해금 재료 테이블
    const UNLOCKED_INGREDIENTS_BY_DAY = {
      1: ['김', '밥', '단무지', '참치'],
      2: ['깻잎'],
      3: ['돈까스'],
      4: ['치즈'],
      5: ['장국']
    };
window.addEventListener('DOMContentLoaded', () => {
  function gameClear(){
      STATE.gameLocked = true;

      if(STATE.totalMoney > STATE.bestMoney){
        localStorage.setItem(BEST_KEY, STATE.totalMoney);
      }

      const screen = document.createElement('div');
      screen.id = 'gameClearScreen';
      screen.style.cssText = `
        position:fixed;
        inset:0;
        background:black;
        color:white;
        font-family:monospace;
        padding:20px;
        z-index:9999;
      `;

      screen.innerHTML = `
<pre>
==================================
           GAME CLEAR
==================================

5일간의 김밥 장사를 마쳤습니다.

총 수익 : ${STATE.totalMoney}원
최고 기록 : ${STATE.bestMoney}원

당신은 훌륭한 김밥 장인입니다.

[ 처음으로 ]
</pre>
`;

      document.body.appendChild(screen);

      screen.addEventListener('click', (e)=>{
        if(e.target.textContent && e.target.textContent.includes('처음으로')){
          location.reload();
        }
      });
    }
  const START_FLAG = 'kimbap_start_game';
  const ORIGINAL_HTML = document.body.innerHTML;
  try {
    // --- State
   const STATE = {
      day: 1,
      inTutorial: false,
      moneyToday: 0,
      totalMoney: 0,
      riceCookTime: 2000,
      expandSpeed: 120, // 김/밥 펼치기 기본 속도(ms)
      sellMultiplier: 1,
      maxOrders: 4,
      stations: [],
      selectedStation: 0,
      unlockedStations: 1, // 처음엔 1칸만 사용 가능
      maxStations: 3,
      orders: [],
      nextOrderId: 1,
      unlocked: {
        김:false, 밥:false, 단무지:false, 참치:false,
        깻잎:false, 돈까스:false, 치즈:false, 장국:false
      },
      prepared: { riceCount: 0 },
      prepareTimers: {},
      dayConfig: {
        served: 0,
        missed: 0,
        maxMiss: 3
      },
      gameLocked: false,
      paused: false,
      upgrades: {
        station: 0,
        rice: 0,
        ingredient: 0
      },
    };

    // 최고 기록 (localStorage)
    const BEST_KEY = 'kimbap_best_money';
    STATE.bestMoney = Number(localStorage.getItem(BEST_KEY) || 0);

    const RECIPES = {
      "기본김밥": ["김","밥","단무지"],
      "참치김밥": ["김","밥","참치"],
      "깻잎김밥": ["김","밥","깻잎"],
      "장국세트": ["김밥","장국"],
      "돈까스김밥": ["김","밥","돈까스"],
      "땡초김밥": ["김","밥","땡초"]
    };
    const DAY_RECIPES = {
  1: `
[ DAY 1 레시피 ]

기본 김밥
- 김
- 밥
- 단무지

참치 김밥
- 김
- 밥
- 참치
`,
  2: `
[ DAY 2 레시피 ]

기본 김밥
- 김
- 밥
- 단무지

참치 김밥
- 김
- 밥
- 참치

깻잎 김밥
- 김
- 밥
- 깻잎
`,
  3: `
[ DAY 3 레시피 ]

기본 김밥
- 김
- 밥
- 단무지

참치 김밥
- 김
- 밥
- 참치

깻잎 김밥
- 김
- 밥
- 깻잎
`
};
    function ensureIngredientEl(id, label){
      let el = document.getElementById(id);
      if(!el){
        el = document.createElement('div');
        el.id = id;
        el.className = 'ing';
        el.textContent = label;
        const ingSection = document.getElementById('ingredients');
        if(ingSection) ingSection.appendChild(el);

        // 드래그 가능 설정
        el.setAttribute('draggable','true');
        el.addEventListener('dragstart', e=>{
          e.dataTransfer.setData('text/plain', label);
        });
      }
      return el;
    }

   function updateIngredientVisibility(){
      const ingSection = document.getElementById('ingredients');
      if (!ingSection) return;

      const ING_LIST = [
        ['김','ing-kim'],
        ['단무지','ing-dan'],
        ['참치','ing-cham'],
        ['깻잎','ing-kkaennip'],
        ['돈까스','ing-donkatsu'],
        ['치즈','ing-cheese'],
        ['장국','ing-jangguk'],
        ['땡초','ing-ttangcho']
      ];

      ING_LIST.forEach(([name, id]) => {
        let el = document.getElementById(id);

        if (!el) {
          el = document.createElement('div');
          el.id = id;
          el.className = 'ing';
          el.textContent = name;
          el.setAttribute('draggable','true');

          el.addEventListener('dragstart', e=>{
            e.dataTransfer.setData('text/plain', name);
          });

          ingSection.appendChild(el);
        }

        el.style.display = STATE.unlocked[name] ? 'inline-block' : 'none';
      });
    }
    const PRICES = {"기본김밥":800, "참치김밥":1200, "깻잎김밥":1300, "장국세트":1800, "돈까스김밥":2000, "땡초김밥":1500};

    const UPGRADE_EFFECTS = {
      station: lvl => Math.min(STATE.maxStations, 1 + lvl),
      riceSpeed: lvl => Math.max(600, 2000 - lvl * 300),
      ingredientBonus: lvl => 1 + lvl * 0.25
    };

    // Day별 설정 테이블
    const DAYS = {
      1: { maxMiss: 3, unlock: ['김','밥','단무지','참치'], needServe: 5 },
      2: { maxMiss: 2, unlock: ['깻잎'], needServe: 7 },
      3: { maxMiss: 2, nude: true, unlock: ['돈까스'], needServe: 8 },
      4: { maxMiss: 1, unlock: ['치즈'], needServe: 9 },
      5: { maxMiss: 1, unlock: ['장국','땡초'], needServe: 9 }
    };

    // DOM refs
    const $ = id => document.getElementById(id);
    let dayInfo = $('dayInfo');
    let moneyTodayBox = $('moneyToday');
    let orderList = $('orderList');
    let statusBox = $('status');
    let riceStack = $('riceStack');
const pauseBtn = document.createElement('div');
pauseBtn.textContent = '멈춤';
pauseBtn.style.cursor = 'pointer';
pauseBtn.style.fontFamily = 'monospace';
pauseBtn.style.margin = '6px 0';

// 위치: Day 옆으로 이동
dayInfo.parentNode.insertBefore(pauseBtn, dayInfo.nextSibling);

pauseBtn.onclick = () => {
  STATE.paused = !STATE.paused;
  pauseBtn.textContent = STATE.paused ? '재개' : '멈춤';
  statusBox.textContent = STATE.paused
    ? '게임이 멈췄어요'
    : '게임 재개!';
};
    const recipeText = $('recipeText');
    if (recipeText) {
      // HTML 드래그 완전 차단
      recipeText.setAttribute('draggable', 'false');

      // 드래그 이벤트 차단
      recipeText.addEventListener('dragstart', e => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });

      // 마우스 선택 드래그 자체 차단 (이게 핵심)
      recipeText.addEventListener('mousedown', e => {
        e.preventDefault();
      });

      // 텍스트 선택 방지
      recipeText.style.userSelect = 'none';
      recipeText.style.webkitUserSelect = 'none';

      // 자식 요소 전부 동일하게 처리
      recipeText.querySelectorAll('*').forEach(el => {
        el.setAttribute('draggable', 'false');

        el.addEventListener('dragstart', e => {
          e.preventDefault();
          e.stopPropagation();
          return false;
        });

        el.addEventListener('mousedown', e => {
          e.preventDefault();
        });

        el.style.userSelect = 'none';
        el.style.webkitUserSelect = 'none';
      });
    }
    const stationEls = Array.from(document.querySelectorAll('.station'));
    const ingKim = $('ing-kim');
    // const ingKnife = $('ing-knife');
    const ingDan = $('ing-dan');
    const ingCham = $('ing-cham');
    const ingBabsot = $('ing-babsot');
    const ingKkaennip = $('ing-kkaennip');
    const ingDonkatsu = $('ing-donkatsu');
    const finishBtn = $('finish');
    if (finishBtn) {
      finishBtn.setAttribute('draggable', 'false');
    }
    if (finishBtn) {
      finishBtn.addEventListener('dragstart', e => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
    const trashBtn = $('trash');
    const ingCheese = $('ing-cheese');
const ingJangguk = $('ing-jangguk');
const ingTtangcho = $('ing-ttangcho');
    let realTrashBtn = trashBtn;
    if(!realTrashBtn){
      realTrashBtn = document.createElement('div');
      realTrashBtn.id = 'trash';
      realTrashBtn.className = 'ing';
      realTrashBtn.textContent = '비우기';
      const ingSection = document.getElementById('ingredients');
      if(ingSection) ingSection.appendChild(realTrashBtn);
    }
    realTrashBtn.setAttribute('draggable', 'false');
    realTrashBtn.addEventListener('dragstart', e => {
      e.preventDefault();
      e.stopPropagation();
    });
    const btnRecipe = $('btn-recipe');

    // 재료 영역 왼쪽 정렬 보정
    const ingSection = document.getElementById('ingredients');
    if (ingSection) {
      ingSection.style.display = 'flex';
      ingSection.style.justifyContent = 'flex-start';
      ingSection.style.gap = '12px';
      ingSection.style.paddingLeft = '0';
      ingSection.style.marginLeft = '0';
    }

    if(!dayInfo || !moneyTodayBox || !orderList || !statusBox || !riceStack || stationEls.length === 0){
      console.error('필수 DOM 요소 누락');
      if(statusBox) statusBox.textContent = '초기화 경고: 일부 UI 요소가 없습니다.';
    }

    // init stations state
    STATE.stations = stationEls.map((_, idx)=> ({
      logical: [],
      visual: [],
      completed: null,
      locked: idx >= STATE.unlockedStations
    }));

    // greetings pool
    const GREET = ["안녕하세요!","오늘 추천 뭐예요?","빨리 주세요!","여기요~"];

    function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

    // 김/밥 확장 애니메이션 함수 (DOM loaded 스코프)
    function expandItemAtIndex(station, idx, type){
      const base = type === '김' ? '김' : '밥';
      const stages = [
        base,
        base.repeat(2),
        base.repeat(3),
        base.repeat(4),
        base.repeat(5)
      ];

      let step = 0;

      const timer = setInterval(() => {
        station.visual[idx] = stages[step];
        renderStations();
        step++;
        if (step >= stages.length){
          clearInterval(timer);
        }
      }, STATE.expandSpeed);
    }

    // render
    function renderStations(){
      // 🔓 조리대 잠금 상태 갱신
      STATE.stations.forEach((s, i) => {
        s.locked = i >= STATE.unlockedStations;
      });
      stationEls.forEach((el, idx)=>{
        const s = STATE.stations[idx];
        const marker = (idx === STATE.selectedStation) ? '>' : ' ';
        el.setAttribute('draggable', false);

        if(s.locked){
          el.textContent = `${marker} 칸 ${idx+1}\n   (잠금)`;
          return;
        }

        const CENTER_PAD = ' ';

        const lines = s.visual.length
          ? s.visual.map(v => {

              // 김 / 밥은 절대 왼쪽부터 출력
              if (
                v === '[김]' ||
                v === '김' ||
                v.startsWith('김김') ||
                v === '[밥]' ||
                v === '밥' ||
                v.startsWith('밥밥')
              ) {
                return v;
              }

              // 속재료만 가운데 정렬
              if (['참치','단무지','치즈','돈까스','깻잎','장국','땡초'].includes(v)) {
                return CENTER_PAD + v;
              }

              return v;
            })
          : ['· 조리대 비어있음'];

        el.textContent = `${marker} 칸 ${idx+1}\n` + lines.join('\n');

        // 🔹 완성된 김밥은 드래그 가능
        if(s.completed){
          el.setAttribute('draggable', 'true');
          el.addEventListener('dragstart', e => {
            STATE.selectedStation = idx;
            e.dataTransfer.setData('text/plain', 'SERVE');
          });
        }
      });
    }
    window.renderStations = renderStations;

    function expandKim(stationIndex){
      const s = STATE.stations[stationIndex];
      if(!s || !s.visual) return;

      const kimIndex = s.visual.findIndex(v => v === '[김]' || v.startsWith('김'));
      if(kimIndex === -1) return;

      const stages = ['김', '김김', '김김김', '김김김김', '김김김김김'];
      let step = 0;

      const interval = setInterval(()=>{
        s.visual[kimIndex] = stages[step];
        renderStations();
        step++;
        if(step >= stages.length){
          clearInterval(interval);
        }
      }, 120);
    }

    function renderOrders(){
      // show greeting under each order
      orderList.textContent = STATE.orders.map(o => `> 손님#${o.id}: ${o.menu}\n  "${o.greeting}"`).join('\n');
    }

    // 주문 영역을 드롭 가능하게 만들기
    orderList.addEventListener('dragover', e => {
      e.preventDefault();
    });

    orderList.addEventListener('drop', e => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if(data === 'SERVE'){
        serveDish();
      }
    });

    function renderRice(){
      const count = STATE.prepared.riceCount || 0;
      riceStack.textContent = count
        ? Array.from({ length: count }).map(() => '밥').join('\n')
        : '(밥 없음)';
    }

    function renderAll(){ renderStations(); renderOrders(); renderRice(); dayInfo.textContent = `Day ${STATE.day}`; moneyTodayBox.textContent = `오늘 번 돈: ${STATE.moneyToday}원`; }

    // station drag & drop handlers
    stationEls.forEach((el, idx) => {
      el.addEventListener('dragover', e => {
        e.preventDefault();
      });

      el.addEventListener('drop', e => {
        e.preventDefault();
        const ing = e.dataTransfer.getData('text/plain');
        // Prevent drop for 완성 or 비우기
        if (ing === '완성' || ing === '비우기') {
          return;
        }
        STATE.selectedStation = idx;
        handleDropIngredient(ing);
      });
      // [김], [밥]일 때만 확장 애니메이션 트리거
      el.addEventListener('click', () => {
        if (STATE.stations[idx].locked) return;

        STATE.selectedStation = idx;
        const s = STATE.stations[idx];

        // [김] 클릭 → 김 확장
        const kimIdx = s.visual.findIndex(v =>
          v === '[김]' || v === '김'
        );
        if (kimIdx !== -1) {
          expandItemAtIndex(s, kimIdx, '김');
          return;
        }

        // [밥] 클릭 → 밥 확장
        const riceIdx = s.visual.findIndex(v =>
          v === '[밥]' || v.startsWith('밥')
        );
        if (riceIdx !== -1) {
          expandItemAtIndex(s, riceIdx, '밥');
        }
      });
    });

    // ingredient flow
    function addIngredientFlow(name){
      if(name === '밥솥'){ cookRice(); return; }
      if(name === '김'){
        const s = STATE.stations[STATE.selectedStation];
        if(s.logical.includes('김')){
          statusBox.textContent = '이미 김이 깔려 있습니다.';
          return;
        }
        s.logical.push('김');
        s.visual.push('[김]');
        statusBox.textContent = '김을 올렸습니다.';
        renderStations();
        return;
      }
      if(name === '밥'){
        if(!STATE.prepared.riceCount || STATE.prepared.riceCount <= 0){
          statusBox.textContent = '밥이 없습니다. 밥솥을 먼저 눌러주세요.';
          return;
        }
        const s = STATE.stations[STATE.selectedStation];
        s.logical.push('밥');
        s.visual.push('[밥]');
        STATE.prepared.riceCount--;
        riceStack.textContent = STATE.prepared.riceCount
          ? Array.from({length: STATE.prepared.riceCount}).map(()=> '밥').join('\n')
          : '(밥 없음)';
        statusBox.textContent = '밥을 김 위에 올렸습니다.';
        renderStations();
        return;
      }
      if(!STATE.prepared[name]){ statusBox.textContent = `${name} 준비중... 다시 누르면 칸에 넣을 수 있습니다.`; if(STATE.prepareTimers[name]) clearTimeout(STATE.prepareTimers[name]); STATE.prepareTimers[name] = setTimeout(()=>{ STATE.prepared[name] = true; statusBox.textContent = `${name} 준비 완료! 다시 눌러 칸에 넣으세요.`; }, 1000); return; }
      const s = STATE.stations[STATE.selectedStation]; s.logical.push(name); s.visual.push(name); STATE.prepared[name] = false; if(STATE.prepareTimers[name]){ clearTimeout(STATE.prepareTimers[name]); STATE.prepareTimers[name] = null; } statusBox.textContent = `${name}이(가) 칸 ${STATE.selectedStation+1}에 추가되었습니다.`; renderStations();
    }

    function handleDropIngredient(name){
      const s = STATE.stations[STATE.selectedStation];
      if(s.locked){
        statusBox.textContent = '잠긴 조리대에는 재료를 올릴 수 없습니다.';
        return;
      }
      if(name === '밥솥'){
        statusBox.textContent = '밥솥은 드래그할 수 없습니다.';
        return;
      }

      if(name === '김'){
        if(s.logical.includes('김')){
          statusBox.textContent = '이미 김이 깔려 있습니다.';
          return;
        }
        s.logical.push('김');
        s.visual = ['[김]']; // 김은 항상 첫 바닥
        renderStations();
        return;
      }

      if(name === '밥'){
        if(!s.logical.includes('김')){
          statusBox.textContent = '김 위에만 밥을 올릴 수 있습니다.';
          return;
        }
        if(!STATE.prepared.riceCount || STATE.prepared.riceCount <= 0){
          statusBox.textContent = '밥이 없습니다.';
          return;
        }

        s.logical.push('밥');
        s.visual.push('[밥]');
        STATE.prepared.riceCount -= 1;
        renderRice();
        renderStations();
        return;
      }

      // 완성 후 옵션 추가
      if(s.completed && (name === '단무지' || name === '치즈')){
        if(!s.completed.options.includes(name)){
          s.completed.options.push(name);
          const optText = s.completed.options.length
            ? `(+${s.completed.options.join('+')})`
            : '';
          s.visual = [`[${s.completed.base}${optText}]`];
          statusBox.textContent = `${name} 추가됨`;
          renderStations();
        }
        return;
      }

      // 완성 전 일반 재료 추가
      s.logical.push(name);
      s.visual.push(name);
      renderStations();
    }

    let cooking = false;

    function cookRice(){
      if(cooking) return;
      cooking = true;
      statusBox.textContent = '밥 짓는 중...';

      setTimeout(()=>{
        if(typeof STATE.prepared.riceCount !== 'number'){
          STATE.prepared.riceCount = 0;
        }
        STATE.prepared.riceCount += 1; // 항상 1개만 생성
        renderRice();
        statusBox.textContent = '밥 완성!';
        cooking = false;
      }, STATE.riceCookTime);
    }

    function finishDish(){
      if (STATE.paused) return;

      const s = STATE.stations[STATE.selectedStation];

      // ❌ 김 또는 밥이 완전히 펼쳐지지 않음
      const hasFullKim = s.visual.some(v => v === '김김김김김');
      const hasFullRice = s.visual.some(v => v === '밥밥밥밥밥');

      if (!hasFullKim || !hasFullRice) {
        statusBox.textContent = '김과 밥을 끝까지 펼쳐야 합니다!';
        return;
      }

      // 이미 김밥이 완성된 상태면 다시 완성 불가
      if(s.completed){
        statusBox.textContent = '이미 완성된 김밥입니다.';
        return;
      }

      // 현재 조리대 재료로 만들 수 있는 김밥 찾기
      let matchedMenu = null;

      for (const [menu, need] of Object.entries(RECIPES)) {
        if (arraysEqual(need, s.logical)) {
          matchedMenu = menu;
          break;
        }
      }

      if (!matchedMenu) {
        statusBox.textContent = '아직 김밥을 완성할 수 없습니다.';
        return;
      }

      s.completed = {
        base: matchedMenu,
        options: []
      };
      s.visual = [`[${matchedMenu}]`];
      statusBox.textContent = `${matchedMenu} 완성! (손님에게 드래그해서 서빙 가능)`;
      renderStations();
    }

    function serveDish(){
      const s = STATE.stations[STATE.selectedStation];
      if(!s.completed){
        statusBox.textContent = '완성된 김밥이 없습니다.';
        return;
      }

      const order = STATE.orders[0];
      const menuName = s.completed.base;
      const optionText = s.completed.options.length
        ? ` (+${s.completed.options.join('+')})`
        : '';
      const fullName = menuName + optionText;

      if(order.menu !== fullName){
        statusBox.textContent = '주문과 다른 김밥입니다.';
        return;
      }

      const price = Math.round((PRICES[menuName] || 500) * (STATE.sellMultiplier || 1));
      STATE.moneyToday += price;
      STATE.totalMoney += price;

      STATE.orders.shift();
      s.logical = [];
      s.visual = [];
      s.completed = null;

      STATE.dayConfig.served++;
      statusBox.textContent = `${fullName} 서빙 완료! (+${price}원)`;

      // 🔥 화면 즉시 갱신
      renderStations();
      renderOrders();
      renderRice();

      // ⭐ 서빙 직후 승리 조건만 1회 검사
      checkDayClear();
      return;
      // (이후 코드 실행 방지)
    }

    function clearStation(){
      const s = STATE.stations[STATE.selectedStation];
      s.logical = [];
      s.visual = [];
      s.completed = null;
      statusBox.textContent = `칸 ${STATE.selectedStation+1}의 재료를 모두 버렸습니다.`;
      renderStations();
    }

    function arraysEqual(need, current){
      if(!need || !current) return false;

      // 필수 재료만 비교
      for(const n of need){
        if(!current.includes(n)) return false;
      }

      // 허용 옵션 재료
      const optionals = ['단무지','치즈'];

      // current에 필수 + 옵션 외 다른 재료가 있으면 실패
      for(const c of current){
        if(!need.includes(c) && !optionals.includes(c)) return false;
      }

      return true;
    }

    // orders spawn with greeting
    function randomOrder(){
      const base = ['기본김밥','참치김밥'];

      if(STATE.unlocked.깻잎) base.push('깻잎김밥');
      if(STATE.unlocked.돈까스) base.push('돈까스김밥');
      if(STATE.unlocked.땡초) base.push('땡초김밥');

      let menu = base[Math.floor(Math.random()*base.length)];

      // 옵션 주문은 전체의 약 30% 확률로만 등장
      const options = [];
      if (Math.random() < 0.3) {
        if (Math.random() < 0.7) options.push('단무지');
        if (STATE.unlocked.치즈 && Math.random() < 0.4) options.push('치즈');
      }

      if (options.length) {
        menu += ` (+${options.join('+')})`;
      }

      return menu;
    }

    function spawnOrder(){ if(STATE.orders.length >= STATE.maxOrders) return; const menu = randomOrder(); const id = STATE.nextOrderId++; const greeting = rand(GREET); STATE.orders.push({ id, menu, created: Date.now(), greeting }); renderOrders(); }

    function scheduleNext(){
      if (STATE.inTutorial || STATE.gameLocked || STATE.paused) return;

      // 손님 간격: 15~20초
      const delay = 15000 + Math.random() * 5000;

      setTimeout(()=>{
        if (STATE.inTutorial || STATE.gameLocked || STATE.paused) return;
        spawnOrder();
        scheduleNext();
      }, delay);
    }

    function checkLeaving(){
      if (STATE.inTutorial || STATE.gameLocked || STATE.paused) return;
      const now = Date.now();
      for(let i=0;i<STATE.orders.length;i++){
        const o = STATE.orders[i];
        if(now - o.created > 14000){
          STATE.orders.splice(i,1);
          STATE.dayConfig.missed++;
          statusBox.textContent = `손님#${o.id}이(가) 떠났습니다 (${STATE.dayConfig.missed}/${STATE.dayConfig.maxMiss})`;
          renderOrders();
          checkGameOver();
          i--;
        }
      }
    }

    // recipe toggle (NULL-safe)
    if(btnRecipe && recipeText){
      btnRecipe.onclick = ()=>{
        recipeText.style.display =
          (recipeText.style.display === 'none' || recipeText.style.display === '')
            ? 'block'
            : 'none';
        // 레시피 다시 열릴 때도 드래그 완전 차단
        recipeText.querySelectorAll('*').forEach(el => {
          el.setAttribute('draggable', 'false');
          el.style.userSelect = 'none';
          el.style.webkitUserSelect = 'none';
        });
      };
      recipeText.style.display = 'none';
    }

    // attach inputs
    // 클릭 이벤트 제거 (드래그 전용)
    // if(ingKim) ingKim.onclick = ()=> addIngredientFlow('김');
    // if(ingKnife) ingKnife.onclick = ()=> useKnife();
    // if(ingDan) ingDan.onclick = ()=> addIngredientFlow('단무지');
    // if(ingCham) ingCham.onclick = ()=> addIngredientFlow('참치');
    if(ingBabsot) ingBabsot.onclick = ()=> addIngredientFlow('밥솥');
    if(finishBtn) {
      finishBtn.onclick = () => {
        const s = STATE.stations[STATE.selectedStation];
        if(s.completed){
          serveDish();
        } else {
          finishDish();
        }
      };
    }
    if(realTrashBtn) realTrashBtn.onclick = clearStation;

    // 재료 요소 드래그 가능 설정 (밥솥 제외, 완성/비우기 제외)
    const ingredientEls = document.querySelectorAll(
      '.ing:not(#ing-babsot):not(#finish):not(#trash)'
    );

    updateIngredientVisibility();

    ingredientEls.forEach(el => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', e => {
        const name = el.textContent.trim();
        if(name === '밥솥') return;
        e.dataTransfer.setData('text/plain', name);
      });
    });

    // 밥 스택 드래그 가능 설정
    riceStack.setAttribute('draggable', 'true');

    riceStack.addEventListener('dragstart', e => {
      if(!STATE.prepared.riceCount || STATE.prepared.riceCount <= 0){
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', '밥');
    });

   function initDay(day){
    STATE.dayConfig.served = 0;
    STATE.dayConfig.missed = 0;
    STATE.dayConfig.maxMiss = DAYS[day].maxMiss;
    STATE.dayConfig.needServe = DAYS[day].needServe;
    // 디버그 안전장치: needServe 보정
    if (typeof STATE.dayConfig.needServe !== 'number') {
      STATE.dayConfig.needServe = 999;
    }
    STATE.orders = [];
    STATE.nextOrderId = 1;
// 🔒 일단 전부 잠금
Object.keys(STATE.unlocked).forEach(k => {
  STATE.unlocked[k] = false;
});

// 🔓 day 1부터 오늘까지 누적 해금
for (let d = 1; d <= day; d++) {
  if (UNLOCKED_INGREDIENTS_BY_DAY[d]) {
    UNLOCKED_INGREDIENTS_BY_DAY[d].forEach(ing => {
      STATE.unlocked[ing] = true;
    });
  }
}

// 화면 갱신
updateIngredientVisibility();

    // ⭐ 재료 DOM 강제 재생성 + 표시 갱신
    updateIngredientVisibility();

    // ⭐ 새로 생긴 재료 포함해서 드래그 다시 바인딩
    document.querySelectorAll('#ingredients .ing').forEach(el => {
      if (el.id === 'ing-babsot') return;
      el.setAttribute('draggable','true');
      el.ondragstart = e => {
        e.dataTransfer.setData('text/plain', el.textContent.trim());
      };
    });

    updateRecipeByDay(day);
  }

    function updateRecipeByDay(day){
      const all = recipeText.querySelectorAll('.recipe');
      all.forEach(el => el.classList.add('hidden'));

      const target = recipeText.querySelector('.day' + day);
      if(target){
        target.classList.remove('hidden');
      }
    }

    
    function gameOver(){
      STATE.gameLocked = true;

      if(STATE.totalMoney > STATE.bestMoney){
        localStorage.setItem(BEST_KEY, STATE.totalMoney);
      }

      const screen = document.createElement('div');
      screen.id = 'gameOverScreen';
      screen.style.cssText = `
  position:fixed;
  inset:0;
  background:black;
  color:white;
  font-family:monospace;
  padding:24px;
  z-index:9999;
`;

      screen.innerHTML = `
<pre>
==================================
            GAME OVER
==================================

손님을 너무 많이 놓쳤습니다.
Day ${STATE.day}

총 수익 : ${STATE.totalMoney}원
최고 기록 : ${STATE.bestMoney}원

[ 다시 시작 ]
[ 타이틀로 ]
</pre>
`;

      document.body.appendChild(screen);

      screen.addEventListener('click', (e)=>{
        if(!e.target.textContent) return;
        if(e.target.textContent.includes('다시 시작')){
          location.reload();
        }
        if(e.target.textContent.includes('타이틀')){
          location.reload();
        }
      });
    }

    function dayClear(){
      if(STATE.totalMoney > STATE.bestMoney){
        localStorage.setItem(BEST_KEY, STATE.totalMoney);
      }

      STATE.gameLocked = true;

      const screen = document.createElement('div');
      screen.id = 'dayClearScreen';
      screen.style.cssText = `
        position:fixed;
        top:0;
        left:0;
        width:100%;
        height:100%;
        background:black;
        color:white;
        font-family:monospace;
        padding:24px;
        z-index:9999;
      `;

      screen.innerHTML = `
<pre style="margin:0; line-height:1.8;">
==================================
         DAY ${STATE.day} CLEAR
==================================

오늘 번 돈 : ${STATE.moneyToday}원
누적 수익 : ${STATE.totalMoney}원

[ 다음 날로 ]
</pre>
`;

      document.body.appendChild(screen);

      screen.addEventListener('click', (e)=>{
        if(!e.target.textContent) return;
        if(e.target.textContent.includes('다음 날')){
          screen.remove();
          openUpgradeScreen();
        }
      });
    }

    // 업그레이드 화면 (중복 제거, applyUpgrade/openIngredientUpgrade도 이 안으로 이동)
    function openUpgradeScreen(){
      STATE.gameLocked = true;
      let selected = 0;

      const options = [
        '조리대 확장 (조리대 2 해금)',
        '밥솥 업그레이드 (밥 짓는 속도 +15%)',
        '재료 업그레이드 (1종 선택)',
        '펼치기 속도 업그레이드 (+10%)'
      ];

      const screen = document.createElement('div');
      screen.id = 'upgradeScreen';
      screen.style.cssText = `
        position:fixed;
        inset:0;
        background:black;
        color:white;
        font-family:monospace;
        padding:24px;
        z-index:9999;
      `;

      function render(){
        screen.innerHTML = `
<pre style="line-height:2.2;">
==================================
           업그레이드 선택
==================================

${options.map((o,i)=>`${selected===i?'>' : ' '} ${i+1}. ${o}`).join('\n')}

결정
</pre>
`;
      }

      render();
      document.body.appendChild(screen);

      function keyHandler(e){
        if(e.key >= '1' && e.key <= '4'){
          selected = Number(e.key) - 1;
          render();
        }
      }

      window.addEventListener('keydown', keyHandler);

      screen.addEventListener('click', (e)=>{
        if(!e.target.textContent || !e.target.textContent.includes('결정')) return;

        window.removeEventListener('keydown', keyHandler);
        screen.remove();

        // ⚠️ 여기서 day 넘기지 않음
        // 각 업그레이드가 스스로 처리하게 맡김
        applyUpgrade(selected);
      });
    }

   function applyUpgrade(type){
  if(type === 0){
    STATE.unlockedStations = 2;
    statusBox.textContent = '조리대 2가 해금되었습니다';
    startNextDay();
    return;
  }

  if(type === 1){
    STATE.riceCookTime *= 0.85;
    statusBox.textContent = '밥 짓는 속도가 빨라졌습니다';
    startNextDay();
    return;
  }

  if(type === 2){
    // ⭐ 재료 업그레이드는 여기서 day 넘기지 않음
    openIngredientUpgrade();
    return;
  }

  if(type === 3){
    STATE.expandSpeed *= 0.9;
    statusBox.textContent = '펼치기 속도가 증가했습니다';
    startNextDay();
    return;
  }
}
function openIngredientUpgrade() {
  const upgradeIngredients = Object.keys(STATE.unlocked).filter(k => STATE.unlocked[k]);
  let selected = 0;

  const screen = document.createElement('div');
  screen.style.cssText = `
    position:fixed;
    inset:0;
    background:black;
    color:white;
    font-family:monospace;
    padding:24px;
    z-index:9999;
  `;

  function render() {
    screen.innerHTML = `
<pre style="line-height:1.6;">
==================================
        재료 업그레이드
==================================

${upgradeIngredients.map((ing, i) =>
  `${selected === i ? '>' : ' '} ${i+1}. ${ing}`
).join('\n')}

결정
</pre>`;
  }

  render();
  document.body.appendChild(screen);

  function keyHandler(e){
    if(e.key >= '1' && e.key <= String(upgradeIngredients.length)){
      selected = Number(e.key) - 1;
      render();
    }
  }

  window.addEventListener('keydown', keyHandler);

  screen.addEventListener('click', e=>{
    if(!e.target.textContent.includes('결정')) return;

    const ing = upgradeIngredients[selected];
    if (!ing) return;
    if(!STATE.ingredientPrices) STATE.ingredientPrices = {};
    STATE.ingredientPrices[ing] = (STATE.ingredientPrices[ing] || 1) * 1.1;

    statusBox.textContent = `${ing} 가격이 10% 상승했습니다`;

    window.removeEventListener('keydown', keyHandler);
    screen.remove();
    STATE.gameLocked = false;
    startNextDay(); // ⭐ 여기서만 day 이동
  });
}
    function upgradeOneIngredient(){
      const todayIngredients = new Set();

      STATE.orders.forEach(o=>{
        const base = o.menu.split(' ')[0];
        if(RECIPES[base]){
          RECIPES[base].forEach(i => todayIngredients.add(i));
        }
      });

      const list = Array.from(todayIngredients);
      if(list.length === 0) return;

      const target = list[Math.floor(Math.random()*list.length)];
      if(!STATE.ingredientPrices) STATE.ingredientPrices = {};
      STATE.ingredientPrices[target] = (STATE.ingredientPrices[target] || 1) * 1.1;

      statusBox.textContent = `${target} 가격이 10% 상승했습니다`;
    }

    function startNextDay(){
      if (STATE.day >= 5) {
        gameClear();
        return;
      }

      STATE.day++;

      if (!DAYS[STATE.day]) {
        gameClear();
        return;
      }

      STATE.moneyToday = 0;
      STATE.orders = [];
      STATE.nextOrderId = 1;
      STATE.gameLocked = false;

      orderList.textContent = '';
      dayInfo.textContent = `Day ${STATE.day}`;

      // ⭐ Day 초기화 (재료 해금 여기서 확정)
      initDay(STATE.day);

      renderAll();

      setTimeout(()=>{
        spawnOrder();
        scheduleNext();
      }, 3000);
    }

    function checkGameOver(){
      if(STATE.dayConfig.missed >= STATE.dayConfig.maxMiss){
        gameOver();
      }
    }

    function checkDayClear(){
      // 이미 클리어/잠금 상태면 무시
      if (STATE.gameLocked) return;

      // 필요 서빙 수를 정확히 만족했을 때만 클리어
      if (
        typeof STATE.dayConfig.needServe === 'number' &&
        STATE.dayConfig.served >= STATE.dayConfig.needServe
      ) {
        STATE.gameLocked = true;
        dayClear();
      }
    }

    // 숫자키 1~2로 조리대 선택 (게임 플레이 중)
    window.addEventListener('keydown', (e) => {
      if (STATE.gameLocked || STATE.paused) return;

      if (e.key === '1' || e.key === '2') {
        const index = Number(e.key) - 1;

        // 조리대 존재 여부
        if (!STATE.stations[index]) return;

        // 잠긴 조리대면 이동 불가
        if (STATE.stations[index].locked) {
          statusBox.textContent = `칸 ${index + 1}은 아직 잠겨있어요`;
          return;
        }

        STATE.selectedStation = index;
        statusBox.textContent = `칸 ${index + 1} 선택됨`;
        renderStations();
      }
    });
    // start
    if(sessionStorage.getItem(START_FLAG)){
      sessionStorage.removeItem(START_FLAG);
      startGame();
    } else {
      showTitleScreen();
    }

    function showTitleScreen(){
      STATE.gameLocked = true;

      const screen = document.createElement('div');
      screen.id = 'titleScreen';
      screen.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:black;
    color:white;
    font-family:monospace;
    padding:24px;
    z-index:9999;
    display:block;
  `;

      screen.innerHTML = `
<pre style="font-size:14px; line-height:1.8; margin:0;">
==================================
            김밥 타이쿤
==================================

[ 시작하기 ]

최고 기록 : ${STATE.bestMoney}원
</pre>
`;

      document.body.appendChild(screen);

      screen.addEventListener('click', (e)=>{
        if(e.target.textContent.includes('시작하기')){
          screen.remove();
          startGame();
        }
      });
    }
function showTutorialOnce(){
  STATE.inTutorial = true;
  STATE.gameLocked = true;

  const screen = document.createElement('div');
  screen.style.cssText = `
    position:fixed;
    inset:0;
    background:black;
    color:white;
    font-family:monospace;
    padding:24px;
    z-index:9999;
  `;

  screen.innerHTML = `
<pre style="line-height:1.8;">
==================================
            튜토리얼
==================================

1. 밥솥을 눌러 밥을 준비하세요
2. 김 → 밥 → 재료 순서로 올리세요
3. 김과 밥은 끝까지 펼쳐야 완성됩니다
4. 완성된 김밥을 손님에게 드래그하세요

[ 시작하기 ]
</pre>
`;

  document.body.appendChild(screen);

  screen.addEventListener('click', e=>{
    if(e.target.textContent.includes('시작하기')){
      screen.remove();

      STATE.inTutorial = false;
      STATE.gameLocked = false;

      // 튜토리얼 종료 후 3초 준비
      setTimeout(()=>{
        spawnOrder();
        scheduleNext();
      }, 3000);
    }
  });
}
    function startGame(){
  showTutorialOnce();

      STATE.day = 1;
      STATE.moneyToday = 0;
      STATE.orders = [];
      STATE.gameLocked = false;

      // setTimeout 블록 제거됨

      initDay(1);
      renderAll();
      setInterval(checkLeaving, 1000);
    }

  } catch(err){ console.error('init failed', err); const s = document.getElementById('status'); if(s) s.textContent = '초기화 오류: '+(err && err.message?err.message:err); }
});

    // 게임 클리어 화면 함수

