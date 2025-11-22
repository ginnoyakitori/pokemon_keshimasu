// keshimasu-client/script.js (最終統合版 - ポケモンケシマス版)
// ----------------------------------------------------

// ★★★ 🚨 要修正 ★★★
// あなたのNode.jsサーバーの公開URLに置き換えてください。
// ローカルでテストする場合は 'http://localhost:3000/api' などに変更
const API_BASE_URL = 'https://pokemon-keshimasu.onrender.com/api'; 

// --- 1. 定数と初期データ ---
// allPuzzlesにはサーバーレスポンス全体（{puzzles: [], cleared_ids: [], ...}）を格納する
// モードを 'pokemon' に統一
let allPuzzles = { pokemon: {} }; 
let POKEMON_DICT = []; // 辞書名をPOKEMON_DICTに変更
let boardData = []; 
let initialPlayData = []; 
let selectedCells = []; 
let usedWords = []; 
// isCountryMode の代わりに isPokemonMode を使う、または削除（モードが一つなので不要だが、ここでは残す）
let isPokemonMode = true; // 常に true
let isCreationPlay = false; 
let currentDictionary = [];
let currentPuzzleIndex = -1; 

// IME入力中かどうかを判定するフラグ（作問モード用）
let isComposing = false;

let currentPlayerNickname = null; // 認証前はnull
let currentPlayerId = null; 
// playerStatsを定義。ホーム画面のクリア数表示はこれを参照する
let playerStats = { 
    pokemon_clears: 0 // クリア数キーをpokemon_clearsに統一
};


// DOM要素の取得
const screens = {
    auth: document.getElementById('auth-screen'), 
    home: document.getElementById('home-screen'),
    mainGame: document.getElementById('main-game-screen'),
    create: document.getElementById('create-puzzle-screen'),
    ranking: document.getElementById('ranking-screen'),
    wordList: document.getElementById('word-list-screen')
};
const appTitleElement = document.getElementById('app-title'); 
const boardElement = document.getElementById('board');
const eraseButton = document.getElementById('erase-button');
const createBoardElement = document.getElementById('create-board');
const btnInputComplete = document.getElementById('btn-input-complete');
const resetBtn = document.getElementById('reset-button');
const inputNickname = document.getElementById('nickname-input');
const inputPasscode = document.getElementById('passcode-input');
const btnLoginSubmit = document.getElementById('login-btn'); 
const btnRegisterSubmit = document.getElementById('signup-btn');
const btnGuestPlay = document.getElementById('guest-play-btn'); 
const welcomeMessage = document.getElementById('welcome-message');
const wordListContent = document.getElementById('word-list-content');
// wordListTabs は HTML から削除されているため、ここではコメントアウトまたは削除を推奨
// const wordListTabs = document.getElementById('word-list-tabs');


// --- ユーティリティ関数 ---
// ... (変更なし)

/** 文字がFまたはカタカナであるかをチェックする */
function isValidGameChar(char) {
    if (char === 'F') return true;
    return /^[\u30a0-\u30ff]$/.test(char); 
}

// --- LocalStorageによるクリア状態管理 ---

/**
 * LocalStorageからクリアした問題のIDリストを取得する
 * (サーバーから取得できなかった場合のフォールバックとして使用)
 */
function getClearedPuzzles(mode) {
    // modeは常に 'pokemon' が渡されることを想定
    const key = `cleared_puzzles_${mode}_id_${currentPlayerId || 'guest'}`;
    const cleared = localStorage.getItem(key);
    return cleared ? JSON.parse(cleared) : [];
}

/**
 * LocalStorageにクリアした問題のIDを記録する
 */
function markPuzzleAsCleared(mode, puzzleId) {
    // modeは常に 'pokemon' が渡されることを想定
    const key = `cleared_puzzles_${mode}_id_${currentPlayerId || 'guest'}`;
    let cleared = getClearedPuzzles(mode);
    if (!cleared.includes(puzzleId)) {
        cleared.push(puzzleId);
        localStorage.setItem(key, JSON.stringify(cleared));
    }
}

// --- サーバー連携・プレイヤー認証 ---

/**
 * サーバーから問題リストを動的にロードする関数
 */
async function loadPuzzlesAndWords() {
    // モードを 'pokemon' に一本化
    const mode = 'pokemon';
    const playerId = currentPlayerId;
    
    try {
        // 1. 問題リストとクリア済みIDの取得
        const url = `${API_BASE_URL}/puzzles/${mode}` + (playerId ? `?playerId=${playerId}` : '');
        const res = await fetch(url);
        
        if (!res.ok) throw new Error(`${mode}問題リストの取得に失敗`);
        
        const data = await res.json();
        
        // レスポンスオブジェクト全体を格納
        allPuzzles[mode] = data; 
        
        // ログイン済みの場合、サーバーの最新クリア済みIDをLocalStorageに上書き同期
        if (data.player_identified) {
            const key = `cleared_puzzles_${mode}_id_${currentPlayerId}`;
            localStorage.setItem(key, JSON.stringify(data.cleared_ids));
        }
        
        // 2. 辞書データの取得
        // サーバー側でポケモン名リストを提供するエンドポイントを想定
        const pokemonWordsRes = await fetch(`${API_BASE_URL}/words/pokemon`); 

        if (!pokemonWordsRes.ok) throw new Error("辞書リストの取得に失敗");

        POKEMON_DICT = await pokemonWordsRes.json();
        
        updateHomeProblemCount();
        
    } catch (error) {
        console.error("問題または辞書のロードに失敗しました。", error);
        if (currentPlayerNickname === 'ゲスト' || !currentPlayerNickname) {
            alert("サーバーから問題データをロードできませんでした。API_BASE_URLが正しいか確認してください。");
        }
    }
}

/**
 * プレイヤーIDから最新のステータスを取得する
 */
async function getPlayerStatus(id) {
    if (!id) return false;
    
    try {
        const response = await fetch(`${API_BASE_URL}/player/${id}`);
        
        if (response.status === 404) {
             console.warn("サーバー応答: プレイヤー情報が見つかりません (404)。ローカルストレージをクリアします。");
             return false;
        }
        if (!response.ok) {
             throw new Error("プレイヤー情報取得サーバーエラー");
        }
        
        const data = await response.json();
        const player = data.player;

        // playerStatsを最新のクリア数で更新
        // サーバー側のフィールド名も pokemon_clears に変更されている前提
        playerStats.pokemon_clears = player.pokemon_clears;
        
        // LocalStorageをサーバーデータで上書き
        if (player.cleared_pokemon_ids) {
            const pokemonKey = `cleared_puzzles_pokemon_id_${id}`;
            localStorage.setItem(pokemonKey, JSON.stringify(player.cleared_pokemon_ids));
        }
        
        return true;
    } catch (error) {
        console.error("プレイヤー情報の取得に失敗。", error);
        return false;
    }
}

/** 認証成功時のセッション設定ヘルパー関数 */
function setPlayerSession(playerData) {
    currentPlayerNickname = playerData.nickname;
    currentPlayerId = playerData.id; 
    // playerStatsを最新のクリア数で更新
    playerStats.pokemon_clears = playerData.pokemon_clears;
    
    localStorage.setItem('keshimasu_nickname', currentPlayerNickname);
    localStorage.setItem('player_id', currentPlayerId);
}

// ... attemptLogin, attemptRegister は currentPlayerId, currentPlayerNickname の設定のみなのでそのまま利用

/**
 * アプリ初期化：認証状態のチェック
 */
async function setupPlayer() {
    currentPlayerId = localStorage.getItem('player_id');
    currentPlayerNickname = localStorage.getItem('keshimasu_nickname');
    
    // ゲストの場合の初期値設定
    if (currentPlayerNickname === 'ゲスト' || !currentPlayerNickname) {
        // キーを 'pokemon' に変更
        playerStats.pokemon_clears = getClearedPuzzles('pokemon').length;
    }

    if (currentPlayerId && currentPlayerNickname && currentPlayerNickname !== 'ゲスト') {
        const success = await getPlayerStatus(currentPlayerId);
        
        if (success) {
            await loadPuzzlesAndWords();
            showScreen('home');
            return;
        }
        
        currentPlayerId = null;
        currentPlayerNickname = null;
        localStorage.removeItem('player_id');
        localStorage.removeItem('keshimasu_nickname');
    }
    
    await loadPuzzlesAndWords(); 
    showScreen('auth');
}


// --- 2. 画面表示と初期化 ---

function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
        screens[key].style.display = (key === screenName) ? 'block' : 'none';
    });
    
    if (screenName === 'home') {
        appTitleElement.style.display = 'block';
        updateHomeProblemCount(); // playerStatsの更新後に呼ばれることを保証
        welcomeMessage.textContent = `${currentPlayerNickname}さん、ようこそ！`;
    } else {
        appTitleElement.style.display = 'none';
    }
}

function updateHomeProblemCount() {
    // モードを 'pokemon' に一本化
    const pokemonCount = allPuzzles.pokemon.puzzles ? allPuzzles.pokemon.puzzles.length : 0;
    
    // LocalStorageではなくplayerStats（サーバーの値）を参照する
    const clearedPokemonCount = playerStats.pokemon_clears;

    // 国名・首都名の表示をポケモンに統一。HTML側でも要素のIDを `#country-problem-count` から `#pokemon-problem-count` などに変更する必要があるが、ここでは便宜上、元のIDを流用（または片方を削除）
    document.getElementById('country-problem-count').textContent = `問題数: ${pokemonCount}問 (クリア済: ${clearedPokemonCount})`;
    
    // HTMLで削除した首都名カウントは不要。念のため、エラー回避のため元のIDの要素が存在すれば空にする
    const capitalCountEl = document.getElementById('capital-problem-count');
    if (capitalCountEl) {
        capitalCountEl.textContent = ''; 
    }
}

/**
 * ゲームの開始
 */
function startGame(isPokemon, isCreation) { // isCountry -> isPokemon に変更
    const mode = 'pokemon'; // モードを 'pokemon' に固定
    const allProblemData = allPuzzles[mode].puzzles || []; 
    
    allProblemData.sort((a, b) => a.id - b.id);
    
    if (!isCreation) {
        // サーバーから取得した cleared_ids を使用して未クリア問題をフィルタリング
        const clearedIds = new Set(allPuzzles[mode].cleared_ids || []); 
        
        const availablePuzzles = allProblemData
            .filter(puzzle => !clearedIds.has(puzzle.id));

        if (availablePuzzles.length === 0) {
            alert(`🎉 ポケモンケシマスのすべての問題をクリアしました！`);
            showScreen('home');
            return;
        }

        const selectedPuzzle = availablePuzzles[0];
        
        // 現在の問題のインデックスを取得
        currentPuzzleIndex = allProblemData.findIndex(p => p.id === selectedPuzzle.id);
        
        initialPlayData = JSON.parse(JSON.stringify(selectedPuzzle.data));
        boardData = JSON.parse(JSON.stringify(selectedPuzzle.data));
        
        // playerStatsのキーを pokemon_clears に変更
        const nextProblemNumber = playerStats.pokemon_clears + 1; 
        document.getElementById('problem-number-display').textContent = `第 ${nextProblemNumber} 問`;
        
    } else {
        currentPuzzleIndex = -1; 
        document.getElementById('problem-number-display').textContent = '問題制作モード'; 
    }

    isPokemonMode = isPokemon; // 常に true
    isCreationPlay = isCreation; 
    currentDictionary = POKEMON_DICT; // 辞書をPOKEMON_DICTに固定
    selectedCells = [];
    usedWords = [];
    eraseButton.disabled = true;
    
    const modeName = 'ポケモンケシマス'; // モード名を固定
    
    document.getElementById('current-game-title').textContent = modeName; 
    
    let creatorName = '銀の焼き鳥'; 
    if (isCreation) {
        creatorName = currentPlayerNickname;
    } else if (currentPuzzleIndex !== -1) {
        creatorName = allProblemData[currentPuzzleIndex].creator; 
    }
    document.getElementById('creator-display').textContent = `制作者: ${creatorName}`;
        
    updateStatusDisplay();
    renderBoard(5); 
    showScreen('mainGame');
}

// ... renderBoard, updateStatusDisplay は盤面表示ロジックのため変更なし

/**
 * プレイヤーのスコアとクリア済みIDをサーバーに更新する
 */
async function updatePlayerScore(mode, puzzleId) { 
    // modeは常に 'pokemon' が渡されることを想定
    if (!currentPlayerId || isCreationPlay) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/score/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                playerId: currentPlayerId,
                mode: mode, // 'pokemon'
                puzzleId: puzzleId // クリアした問題のIDをサーバーに送信
            })
        });
        
        if (!response.ok) throw new Error('スコア更新サーバーエラー');

        const data = await response.json();
        
        // サーバーから返された最新スコアでplayerStatsを直ちに更新
        playerStats.pokemon_clears = data.newScore; // キーを pokemon_clears に変更
        
    } catch (error) {
        console.error("スコア更新に失敗しました。", error);
    }
}

/**
 * 問題制作モードでクリアした問題をサーバーに登録する関数
 */
async function submitNewPuzzle(mode, boardData, creator) {
    // modeは常に 'pokemon' が渡されることを想定
    try {
        const response = await fetch(`${API_BASE_URL}/puzzles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mode: mode, // 'pokemon'
                boardData: boardData,
                creator: creator
            })
        });
        
        if (!response.ok) throw new Error('問題登録サーバーエラー');

        const data = await response.json();
        
        alert(`🎉 問題の登録に成功しました！\n制作者：${data.puzzle.creator}\nこの問題は今後、標準問題として出題されます。`);
        
        await loadPuzzlesAndWords(); // 問題を再ロードして最新の問題リストを取得
        
    } catch (error) {
        console.error("問題登録に失敗しました。", error);
        alert("問題の登録に失敗しました。サーバーが起動しているか、API_BASE_URLが正しいか確認してください。");
    }
}

/**
 * ゲームクリア時にスコア更新、通知、画面更新を行う
 */
async function checkGameStatus() { 
    const totalChars = boardData.flat().filter(char => char !== '').length;
    
    if (totalChars === 0) {
        const mode = 'pokemon'; // モードを 'pokemon' に固定
        const modeName = 'ポケモン'; // モード名も固定
        
        if (!isCreationPlay) {
            const problemDataList = allPuzzles[mode].puzzles || [];
            // initialPlayData (解答前の盤面)からパズルIDを特定する
            const currentPuzzle = problemDataList.find(p => JSON.stringify(p.data) === JSON.stringify(initialPlayData)); 

            if (currentPuzzle && currentPuzzle.id) {
                markPuzzleAsCleared(mode, currentPuzzle.id); 
                
                // 1. スコア更新を待ち、playerStatsを最新値にする
                if (currentPlayerId) {
                    await updatePlayerScore(mode, currentPuzzle.id); 
                } else {
                    // ゲストモードの場合、ローカルでスコアをインクリメント
                    playerStats.pokemon_clears++; // キーを pokemon_clears に変更
                }
            }

            // 2. 通知に最新のスコア (playerStats.pokemon_clears) を反映
            const latestClearedCount = playerStats.pokemon_clears; 
            alert(`🎉 全ての文字を消去しました！クリアです！\nあなたの${modeName}クリア数は${latestClearedCount}問になりました。`);
            
            // 3. 問題リストとホーム画面表示を更新するため、サーバーからデータを再ロード
            await loadPuzzlesAndWords(); 
            showScreen('home'); // 標準モードはホームに戻る
        
        } else {
            const registrationConfirmed = confirm("🎉 作成した問題をクリアしました！\nこの問題を標準問題として登録しますか？");
            if (registrationConfirmed) {
                const finalBoard = JSON.parse(JSON.stringify(initialPlayData));
                await submitNewPuzzle(mode, finalBoard, currentPlayerNickname);
                showScreen('home'); // 登録した場合はホームに戻る
            } else {
                alert("問題の登録をスキップしました。作成画面に戻ります。");
                
                // 登録スキップ時は、作成画面に戻して再編集可能にする
                showScreen('create'); 
                renderCreateBoard(); 
                fillCreateBoard(initialPlayData); // 元の入力データを復元
                btnInputComplete.disabled = false;
                document.getElementById('create-status').textContent = '入力完了！解答を開始できます。';
                // モード選択がHTMLから削除されているため、この行は削除
                // document.getElementById('creation-mode-select').value = mode; 
            }
        }
    }
}


// --- 3. ゲームロジックの中核 ---
// ... (変更なし)

/** セルクリックハンドラ */
// ... (変更なし)

/** 消去ボタンイベントリスナー */
eraseButton.addEventListener('click', async () => { 
    if (selectedCells.length < 2) return;

    // 選択されたセルを正しい順番（左から右、上から下）にソートする
    let sortedSelectedCells = [...selectedCells];
    const [firstR, firstC] = selectedCells[0];
    // selectedCellsがすべて同じ行 (r) であれば水平方向
    const isHorizontal = selectedCells.every(coord => coord[0] === firstR); 
    
    if (isHorizontal) {
        // 水平方向の場合: 列 (c) で昇順にソート (左から右)
        sortedSelectedCells.sort((a, b) => a[1] - b[1]);
    } else {
        // 垂直方向の場合: 行 (r) で昇順にソート (上から下)
        sortedSelectedCells.sort((a, b) => a[0] - b[0]);
    }

    let selectedWordChars = sortedSelectedCells.map(([r, c]) => boardData[r][c]); 
    let selectedWord = selectedWordChars.join(''); 
    let finalWord = ''; 

    const mode = 'ポケモン'; // モード名を 'ポケモン' に固定
    
    if (selectedWord.includes('F')) {
        let tempWordChars = [...selectedWordChars]; 
        let fIndices = []; 

        selectedWordChars.forEach((char, index) => {
            if (char === 'F') {
                fIndices.push(index);
            }
        });

        for (const index of fIndices) {
            let inputChar = '';
            
            const promptText = `「${selectedWord}」のうち、${index + 1}文字目（F）を何にしますか？`;
            let input = prompt(promptText);

            if (input && input.trim() !== '') {
                inputChar = toKatakana(input).toUpperCase().slice(0, 1);
                if (!isValidGameChar(inputChar) && inputChar !== 'F') {
                    alert('入力された文字は有効ではありません。');
                    return; 
                }
                tempWordChars[index] = inputChar; 
            } else {
                alert('文字が入力されませんでした。');
                return; 
            }
        }
        finalWord = tempWordChars.join('');
    } else {
        finalWord = selectedWord;
    }

    if (!currentDictionary.includes(finalWord)) {
        alert(`「${finalWord}」は有効な${mode}名ではありません。`); // メッセージ変更
        return;
    }

    if (usedWords.includes(finalWord)) {
        alert(`「${finalWord}」は既に使用済みです。`);
        return;
    }

    selectedCells.forEach(([r, c]) => {
        boardData[r][c] = '';
    });
    
    usedWords.push(finalWord);
    
    applyGravity();
    
    selectedCells = [];
    eraseButton.disabled = true;
    
    renderBoard(5); 
    updateStatusDisplay();
    await checkGameStatus();
});

resetBtn.addEventListener('click', () => { 
    if (isCreationPlay) {
        showScreen('create');
        renderCreateBoard(); // 制作画面のボードをリセット
        // 制作モードで元の入力データを盤面に復元
        fillCreateBoard(initialPlayData); 
        btnInputComplete.disabled = false;
        document.getElementById('create-status').textContent = '入力完了！解答を開始できます。';
        
    } else if (currentPuzzleIndex !== -1) {
        // allPuzzles.pokemon.puzzles を参照する
        const problemDataList = allPuzzles.pokemon.puzzles;
        const selectedPuzzle = problemDataList[currentPuzzleIndex];
        
        initialPlayData = JSON.parse(JSON.stringify(selectedPuzzle.data));
        boardData = JSON.parse(JSON.stringify(selectedPuzzle.data));
        selectedCells = [];
        usedWords = [];
        eraseButton.disabled = true;
        
        renderBoard(5); 
        updateStatusDisplay();
    }
});


// --- 4. 問題制作モードのロジック ---
// ... renderCreateBoard, fillCreateBoard, checkCreationInput は微修正 (creation-mode-selectの操作削除)

function renderCreateBoard() { 
    createBoardElement.innerHTML = '';
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 5; c++) {
            const cell = document.createElement('div');
            cell.classList.add('create-cell');
            
            const input = document.createElement('input');
            input.classList.add('create-input');
            input.type = 'text';
            input.maxLength = 1;
            input.dataset.r = r;
            input.dataset.c = c;
            
           // --- フリック入力・濁音対応（IME制御） ---
            input.addEventListener('compositionstart', () => {
                isComposing = true;
            });

            input.addEventListener('compositionend', (e) => {
                isComposing = false;
                // 確定後、即座にチェックを実行
                checkCreationInput(e); 
            });
            
            input.addEventListener('input', (e) => {
                // IME入力中でなければ、すぐにチェック
                if (!isComposing) {
                    checkCreationInput(e);
                }
            });
            
            // フォーカスが外れたとき（濁音などが確定する）
            input.addEventListener('blur', (e) => {
                isComposing = false; 
                checkCreationInput(e);
            });
            
            cell.appendChild(input);
            createBoardElement.appendChild(cell);
        }
    }
    // HTMLから削除された creation-mode-select 関連の操作は不要
}

// ... fillCreateBoard, checkCreationInput は変更なし

btnInputComplete.addEventListener('click', () => {
    const inputs = document.querySelectorAll('.create-input');
    let newBoard = Array(8).fill(0).map(() => Array(5).fill(''));
    
    inputs.forEach(input => {
        const r = parseInt(input.dataset.r);
        const c = parseInt(input.dataset.c);
        newBoard[r][c] = input.value;
    });

    // モード選択を削除し、常に isPokemon = true で startGame を呼び出す
    initialPlayData = JSON.parse(JSON.stringify(newBoard));
    boardData = JSON.parse(JSON.stringify(newBoard));
    startGame(true, true); // isPokemon=true, isCreation=true
});


// --- 5. ランキングロジック ---

const rankingScreen = document.getElementById('ranking-screen');
// rankingTabs は HTML から削除されているため、ここではコメントアウトまたは削除を推奨
// const rankingTabs = document.getElementById('ranking-tabs');

async function fetchAndDisplayRanking(type) {
    // typeは常に 'pokemon' が渡されることを想定（HTMLのランキングタブが削除されているため）
    const container = document.getElementById('ranking-list-container');
    container.innerHTML = `<div>ランキングをサーバーから取得中...</div>`;

    const totalScore = playerStats.pokemon_clears; // スコアを一本化
    document.getElementById('ranking-nickname-display').innerHTML = `あなたの記録: <strong>${currentPlayerNickname}</strong> (クリア数: ${totalScore})`;

    try {
        // エンドポイントを /rankings/pokemon に変更 (サーバー側もこれに合わせてください)
        const response = await fetch(`${API_BASE_URL}/rankings/pokemon`); 
        
        if (!response.ok) throw new Error('ランキング取得サーバーエラー');

        const rankings = await response.json();
        
        let html = `<h3>ポケモンケシマス ランキング</h3>`; // タイトルを固定
        html += `<table class="ranking-table"><tr><th>順位</th><th>ニックネーム</th><th>クリア数</th></tr>`;
        
        rankings.forEach(item => {
            const isCurrentPlayer = item.nickname === currentPlayerNickname;
            html += `<tr style="${isCurrentPlayer ? 'background-color: #554400; font-weight: bold; color:#FFD700;' : ''}"><td>${item.rank}</td><td>${item.nickname}</td><td>${item.score}</td></tr>`;
        });
        
        html += '</table>';
        container.innerHTML = html;

    } catch (error) {
        console.error("ランキング取得に失敗しました。", error);
        container.innerHTML = `<p style="color:red;">ランキング取得エラー: サーバーが起動しているか、ネットワーク接続を確認してください。</p>`;
    }
}


// --- 5.5. ワードリスト表示ロジック ---

function displayWordList(type) {
    // typeは無視し、常に POKEMON_DICT を使用
    const dictionary = POKEMON_DICT;
    
    if (dictionary.length === 0) {
        wordListContent.innerHTML = `<p>辞書データがサーバーからロードされていません。</p>`;
        return;
    }

    // HTMLからタブ操作が削除されているため、この部分は不要
    /*
    wordListTabs.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.type === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    */

    wordListContent.innerHTML = '';
    dictionary.sort((a, b) => {
        if (a.length !== b.length) {
            return a.length - b.length;
        }
        return a.localeCompare(b);
    });
    
    dictionary.forEach(word => {
        const item = document.createElement('div');
        item.classList.add('word-item');
        item.textContent = word;
        wordListContent.appendChild(item);
    });
}

// --- 6. イベントリスナーの設定 ---
// --- 6. イベントリスナーの設定 ---
// 日本語入力時でもリアルタイムでmaxlengthを強制する関数
function enforceMaxLength(elementId, maxLength) {
    const inputElement = document.getElementById(elementId);
    if (inputElement) {
        inputElement.addEventListener('input', function() {
            if (this.value.length > maxLength) {
                this.value = this.value.substring(0, maxLength);
            }
        });
    }
}

if (btnLoginSubmit) {
    btnLoginSubmit.addEventListener('click', () => {
        attemptLogin(inputNickname.value, inputPasscode.value);
    });
}

if (btnRegisterSubmit) {
    btnRegisterSubmit.addEventListener('click', () => {
        attemptRegister(inputNickname.value, inputPasscode.value);
    });
}

if (inputPasscode) {
    inputPasscode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            attemptLogin(inputNickname.value, inputPasscode.value);
        }
    });
}

if (btnGuestPlay) { 
    btnGuestPlay.addEventListener('click', async () => {
        currentPlayerNickname = "ゲスト";
        currentPlayerId = null;
        localStorage.removeItem('player_id');
        localStorage.removeItem('keshimasu_nickname');
        
        // ゲストモード開始時にローカルのクリア数をplayerStatsに反映
        // キーを 'pokemon_clears' に統一
        playerStats.pokemon_clears = getClearedPuzzles('pokemon').length; 
        
        alert("ゲストとしてゲームを開始します。スコアはランキングに保存されません。");
        await loadPuzzlesAndWords(); 
        showScreen('home');
    });
}

document.getElementById('btn-logout').addEventListener('click', () => {
    currentPlayerNickname = null;
    currentPlayerId = null;
    localStorage.removeItem('player_id');
    localStorage.removeItem('keshimasu_nickname');
    inputNickname.value = '';
    inputPasscode.value = '';
    showScreen('auth');
});

// ホーム画面リスナー
// 国名モードボタンをポケモンモードボタンとして再利用（HTMLのID変更を推奨）
document.getElementById('btn-country-mode').addEventListener('click', () => {
    // isPokemon=true, isCreation=false でゲーム開始
    startGame(true, false); 
});

// 首都名モードボタンは削除（HTMLから削除を推奨）
const btnCapitalMode = document.getElementById('btn-capital-mode');
if (btnCapitalMode) {
    // 首都名ボタンのリスナーを削除 (startGame(false, false) の呼び出しを削除)
    // 実際にはHTMLから削除することで対応するが、JS側で保険として無効化
    btnCapitalMode.removeEventListener('click', () => {
        startGame(false, false); 
    });
    // または、以下のように削除・非表示にするロジックをクライアント側に追加することも可能
    // btnCapitalMode.style.display = 'none';
}

document.getElementById('btn-create-mode').addEventListener('click', () => {
    if (!currentPlayerNickname || currentPlayerNickname === 'ゲスト') {
        alert("問題制作モードを利用するには、ログインしてください。");
        return;
    }
    showScreen('create');
    renderCreateBoard();
    checkCreationInput();
});

document.getElementById('btn-ranking').addEventListener('click', () => {
    showScreen('ranking');
    // ランキングのタイプは 'pokemon' または 'total' に一本化 (ここではサーバーとの連携を考慮し 'pokemon' に固定)
    fetchAndDisplayRanking('pokemon');
});

// ランキングタブのリスナー (HTML側のタブが削除されている場合は不要だが、残す場合はタイプをチェック)
const rankingTabs = document.getElementById('ranking-tabs');
if (rankingTabs) {
    rankingTabs.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') {
            // 国名・首都名を排除し、常に 'pokemon' ランキングを表示
            fetchAndDisplayRanking('pokemon'); 
        }
    });
}

// ワードリストボタンのリスナー
document.getElementById('btn-word-list').addEventListener('click', () => {
    showScreen('wordList');
    // 常にポケモン辞書を表示
    displayWordList('pokemon'); 
});

// wordListTabs のリスナーは削除（モードが一つになったため）
const wordListTabs = document.getElementById('word-list-tabs');
if (wordListTabs) {
    // 辞書タブのリスナーを削除 (モードが一つになったため)
    wordListTabs.removeEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') {
            displayWordList(event.target.dataset.type);
        }
    });
    // または、以下のように削除・非表示にするロジックをクライアント側に追加することも可能
    // wordListTabs.style.display = 'none';
}


// 画面遷移ボタン (変更なし)
document.getElementById('btn-back-to-home').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('btn-create-back').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('btn-ranking-back').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('btn-word-list-back').addEventListener('click', () => {
    showScreen('home');
});

// --- 7. 初期化 ---
// ニックネーム入力の制限を適用
document.addEventListener('DOMContentLoaded', () => {
    enforceMaxLength('nickname-input', 20); 
});

setupPlayer();