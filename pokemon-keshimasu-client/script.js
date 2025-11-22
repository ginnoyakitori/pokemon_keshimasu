// =========================================================================
// 🌐 グローバル定数と変数
// =========================================================================

// サーバーURL
const API_BASE_URL = 'https://pokemon-keshimasu.onrender.com/api'; 
const BOARD_ROWS = 8;
const BOARD_COLS = 5;
const GAME_MODE = 'pokemon'; 
const LOCAL_STORAGE_KEY = 'pokemonKeshimasuPlayer';

// プレイヤー情報とゲーム状態
let currentPlayer = null;
let currentPuzzles = []; 
let currentPuzzleIndex = 0;
let clearedPuzzleIds = [];
let availableWords = new Set(); 

// DOM要素のキャッシュ
const dom = {};


// =========================================================================
// 🚀 ユーティリティ関数
// =========================================================================

/**
 * 画面切り替えユーティリティ
 * @param {string} targetScreenId - 表示する画面のID
 */
function showScreen(targetScreenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.style.display = 'none';
        screen.classList.remove('active-screen');
    });
    const targetScreen = document.getElementById(targetScreenId);
    if (targetScreen) {
        targetScreen.style.display = 'block';
        targetScreen.classList.add('active-screen');
    }
}

/**
 * API呼び出しヘルパー
 * @param {string} endpoint - APIエンドポイント
 * @param {object} options - fetchオプション
 * @returns {Promise<object>} - JSONレスポンスデータ
 */
async function fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'APIエラーが発生しました' }));
        throw new Error(errorData.message || '不明なAPIエラー');
    }
    return response.json();
}

// =========================================================================
// 🔑 認証とプレイヤー管理
// =========================================================================

/**
 * ログインまたは新規登録を試行する
 */
async function attemptAuth(isNewUser) {
    const nickname = dom.nicknameInput.value.trim();
    const passcode = dom.passcodeInput.value;

    if (!nickname || !passcode) {
        alert('ニックネームとパスコードは必須です。');
        return;
    }

    try {
        const result = await fetchAPI('/player/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, passcode })
        });

        if (isNewUser && !result.isNewUser) {
            alert('そのニックネームは既に存在します。ログインしてください。');
            return;
        }
        if (!isNewUser && result.isNewUser) {
            alert('そのニックネームは登録されていません。新規登録してください。');
            return;
        }
        
        // 認証成功
        setPlayer(result.player);
        alert(`${result.player.nickname}さん、${result.isNewUser ? '新規登録' : 'ログイン'}に成功しました！`);
        await loadInitialData();

    } catch (error) {
        console.error('認証エラー:', error);
        alert(`認証中にエラーが発生しました: ${error.message}`);
    }
}

/**
 * ログインを試行する
 */
function attemptLogin() {
    attemptAuth(false);
}

/**
 * 新規登録を試行する
 */
function attemptRegister() {
    attemptAuth(true);
}

/**
 * ゲストとしてプレイを開始する
 */
async function playAsGuest() {
    setPlayer(null); // プレイヤー情報をリセット
    alert('ゲストとしてプレイします。スコアは保存されません。');
    await loadInitialData();
}

/**
 * プレイヤー情報を設定し、ローカルストレージに保存
 * @param {object | null} player - プレイヤーオブジェクト
 */
function setPlayer(player) {
    currentPlayer = player;
    if (player) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(player));
        clearedPuzzleIds = player.cleared_pokemon_ids || [];
    } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        clearedPuzzleIds = [];
    }
    
    updateWelcomeMessage();
}

/**
 * ログアウト処理
 */
function logout() {
    setPlayer(null);
    alert('ログアウトしました。');
    showScreen('auth-screen');
}

/**
 * 初期データをロードし、ホーム画面を準備
 */
async function loadInitialData() {
    try {
        // 1. ワードリストを取得
        const wordData = await fetchAPI(`/words/${GAME_MODE}`);
        availableWords = new Set(wordData.map(w => w.toUpperCase()));
        
        // 2. 問題リストとクリア済みIDを取得
        const playerId = currentPlayer ? currentPlayer.id : '';
        const puzzleResponse = await fetchAPI(`/puzzles/${GAME_MODE}?playerId=${playerId}`);
        
        currentPuzzles = puzzleResponse.puzzles;
        if (currentPlayer) {
            clearedPuzzleIds = puzzleResponse.cleared_ids || [];
        }
        
        // 問題数を更新
        const totalPuzzles = currentPuzzles.length;
        const unclearedCount = totalPuzzles - clearedPuzzleIds.length;
        
        dom.problemCountDisplay.textContent = 
            `未クリア問題数: ${unclearedCount}問 (全 ${totalPuzzles}問)`;

        updateWelcomeMessage();
        showScreen('home-screen');

    } catch (error) {
        console.error('初期データロードエラー:', error);
        alert(`初期データのロードに失敗しました: ${error.message}`);
        showScreen('auth-screen'); // ロード失敗時は認証画面に戻す
    }
}

/**
 * ウェルカムメッセージを更新
 */
function updateWelcomeMessage() {
    if (currentPlayer) {
        // ★修正箇所★
        dom.welcomeMessage.textContent = `${currentPlayer.nickname}さん、ようこそ！`;
    } else {
        dom.welcomeMessage.textContent = 'ゲストプレイヤーとして楽しめます。';
    }
}


// =========================================================================
// 🎮 ゲームプレイロジック
// =========================================================================

/**
 * ポケモンケシマスを開始する
 */
function startPokemonMode() {
    // 1. 問題総数をチェック
    if (currentPuzzles.length === 0) {
        alert('現在、問題がありません。誰かが新しい問題を作るまでお待ちください！');
        showScreen('home-screen'); 
        return;
    }

    // 2. 未クリアの問題をフィルタリング (currentPuzzlesはcreated_at ASCでソート済み)
    const unclearedPuzzles = currentPuzzles.filter(p => !clearedPuzzleIds.includes(p.id));
    
    // 3. 全クリアチェック
    if (unclearedPuzzles.length === 0) {
        alert('全てのポケモンケシマス問題をクリアしました！新しい問題が追加されるまでお待ちください。');
        return;
    }

    // 4. 最も古い未クリア問題を取得 (配列の0番目が最も古い)
    const nextPuzzle = unclearedPuzzles[0];
    
    // 5. 全問題リスト内でのインデックスを取得 (表示用)
    currentPuzzleIndex = currentPuzzles.findIndex(p => p.id === nextPuzzle.id);

    // 6. ゲーム盤面を初期化
    initializeGameBoard(nextPuzzle.data, nextPuzzle.id); 

    // UI更新
    dom.problemNumberDisplay.textContent = `第 ${currentPuzzleIndex + 1} 問`;
    dom.creatorDisplay.textContent = `制作者: ${nextPuzzle.creator || '名無し'}`;
    dom.usedWordsDisplay.textContent = 'なし';
    
    showScreen('main-game-screen');
}

/**
 * ゲーム盤面を初期化する
 * @param {string} boardData - JSON形式の盤面データ
 * @param {number} puzzleId - 問題ID
 */
function initializeGameBoard(boardData, puzzleId) {
    dom.board.innerHTML = '';
    
    // 実際のボードデータを使用
    let currentBoardState;
    try {
        currentBoardState = JSON.parse(boardData);
    } catch {
        // データがない、またはパースエラーの場合のフォールバック
        currentBoardState = [];
        for(let r=0; r<BOARD_ROWS; r++) {
             // ダミーデータを生成 (例: [['A','B','C',...], [...]])
             currentBoardState.push(Array(BOARD_COLS).fill('F'));
        }
    }

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            
            // 盤面の文字を設定 
            cell.textContent = currentBoardState[r][c]; 
            
            // ★表示制限のロジック: r < 3 (上3段: 0, 1, 2行目) は隠す★
            if (r < (BOARD_ROWS - 5)) { 
                cell.classList.add('hidden-cell');
            }
            
            // セルの位置情報をデータ属性として保持
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            cell.addEventListener('click', handleCellClick);
            dom.board.appendChild(cell);
        }
    }
    // 実際にゲームロジックで使う変数（盤面状態、選択状態）をリセット
}

/**
 * セルがクリックされた時の処理 (ダミー)
 */
function handleCellClick(event) {
    const cell = event.target;
    // hidden-cellはクリックできないようにCSSで設定されているため、ここでは主に下5段のセルを処理
    
    cell.classList.toggle('selected');
    dom.eraseButton.disabled = document.querySelectorAll('.selected').length === 0;
}

/**
 * 選択された文字を消去する (ダミー)
 */
function eraseSelected() {
    const selectedCells = document.querySelectorAll('.selected');
    if (selectedCells.length < 2) {
        alert('2文字以上選択してください。');
        return;
    }
    
    alert('消去処理を実行します (ロジック未実装)');
    
    // スコア更新APIを呼び出す（デモ目的で即時呼び出し）
    if (currentPlayer) {
        // submitScore(currentPuzzles[currentPuzzleIndex].id); // 実際のゲームではクリア時に実行
    }
}

/**
 * ゲームをリセットする (ダミー)
 */
function resetGame() {
    if (confirm('現在の盤面をリセットしますか？')) {
        startPokemonMode(); // 現在の問題を再ロード
    }
}

/**
 * クリア時にスコアをサーバーに送信する
 * @param {number} puzzleId - クリアした問題のID
 */
async function submitScore(puzzleId) {
    if (!currentPlayer) return;

    try {
        const result = await fetchAPI('/score/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: currentPlayer.id, mode: GAME_MODE, puzzleId: puzzleId })
        });
        
        if (result.message.includes('既にクリア済み')) {
             console.warn(result.message);
        } else {
            alert(`問題 ${puzzleId} をクリア！新スコア: ${result.newScore}`);
            currentPlayer.pokemon_clears = result.newScore;
            clearedPuzzleIds.push(puzzleId);
        }
        
        setPlayer(currentPlayer); 
        loadInitialData(); 
        
    } catch (error) {
        console.error('スコア送信エラー:', error);
        alert('スコアの更新に失敗しました。');
    }
}

// =========================================================================
// 🧩 サブ画面ロジック
// =========================================================================

/**
 * ランキング画面を表示
 */
async function showRankingScreen() {
    showScreen('ranking-screen');
    dom.rankingListContainer.innerHTML = 'ランキングをロード中...';
    
    try {
        const rankings = await fetchAPI(`/rankings/${GAME_MODE}`); 
        
        if (currentPlayer) {
            const playerRank = rankings.find(r => r.nickname === currentPlayer.nickname);
            dom.rankingNicknameDisplay.textContent = `あなたの記録: ${playerRank ? `${playerRank.rank}位 (${playerRank.score}クリア)` : `未ランクイン (${currentPlayer.pokemon_clears || 0}クリア)`}`;
        } else {
            dom.rankingNicknameDisplay.textContent = 'あなたの記録: ゲスト (スコア非保存)';
        }

        const html = `
            <table>
                <thead><tr><th>順位</th><th>ニックネーム</th><th>スコア</th></tr></thead>
                <tbody>
                    ${rankings.map(r => `
                        <tr class="${currentPlayer && r.nickname === currentPlayer.nickname ? 'highlight-row' : ''}">
                            <td>${r.rank}</td>
                            <td>${r.nickname}</td>
                            <td>${r.score}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        dom.rankingListContainer.innerHTML = html;

    } catch (error) {
        console.error('ランキング取得エラー:', error);
        dom.rankingListContainer.innerHTML = 'ランキングの取得に失敗しました。';
    }
}

/**
 * ワードリスト画面を表示
 */
function showWordListScreen() {
    showScreen('word-list-screen');
    dom.wordListModeDisplay.textContent = `モード: ${GAME_MODE.toUpperCase()} (${availableWords.size}語)`;
    
    const wordsArray = Array.from(availableWords).sort();
    
    const html = wordsArray.map(word => `<span>${word}</span>`).join('');
    dom.wordListContent.innerHTML = html;
}

/**
 * 問題制作画面を表示
 */
function showCreatePuzzleScreen() {
    showScreen('create-puzzle-screen');
    
    // ★問題制作ボードの初期化ロジック★
    dom.createBoard.innerHTML = ''; 
    
    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'create-cell-input';
            input.maxLength = 1; 
            
            // 入力監視イベントを設定
            input.addEventListener('input', updateCreateStatus);
            
            dom.createBoard.appendChild(input);
        }
    }
    
    updateCreateStatus(); // 初期状態のステータスを表示
}

/**
 * 問題制作時の入力状態を更新する
 */
function updateCreateStatus() {
    const inputs = document.querySelectorAll('#create-puzzle-screen .create-cell-input');
    let filledCount = 0;
    
    inputs.forEach(input => {
        if (input.value.trim().length === 1) {
            filledCount++;
        }
    });

    const totalCells = BOARD_ROWS * BOARD_COLS;
    const remaining = totalCells - filledCount;
    dom.createStatus.textContent = `残り${remaining}マスに入力が必要です。`;
    
    // 全て埋まったら完了ボタンを有効化
    document.getElementById('btn-input-complete').disabled = remaining > 0;
}


/**
 * 問題制作完了時に実行 (ダミー)
 */
function completeCreation() {
    if (!currentPlayer) {
        alert('ログインして問題を登録してください。');
        return;
    }
    
    // ここで inputs からデータを集めてJSON化し、APIで登録する
    alert('問題制作完了と登録処理を実行します (ロジック未実装)');
    backToHome();
}

/**
 * ホーム画面に戻る
 */
function backToHome() {
    loadInitialData(); 
}


// =========================================================================
// ✨ 初期化処理とイベントリスナー設定
// =========================================================================

/**
 * DOM要素のキャッシュ
 */
function cacheDOMElements() {
    dom.nicknameInput = document.getElementById('nickname-input');
    dom.passcodeInput = document.getElementById('passcode-input');
    dom.welcomeMessage = document.getElementById('welcome-message');
    dom.problemCountDisplay = document.getElementById('country-problem-count');
    dom.board = document.getElementById('board');
    dom.currentGameTitle = document.getElementById('current-game-title');
    dom.creatorDisplay = document.getElementById('creator-display');
    dom.usedWordsDisplay = document.getElementById('used-words-display');
    dom.eraseButton = document.getElementById('erase-button'); 
    dom.problemNumberDisplay = document.getElementById('problem-number-display');
    dom.createBoard = document.getElementById('create-board');
    dom.createStatus = document.getElementById('create-status');
    dom.rankingListContainer = document.getElementById('ranking-list-container');
    dom.rankingNicknameDisplay = document.getElementById('ranking-nickname-display');
    dom.wordListModeDisplay = document.getElementById('word-list-mode-display');
    dom.wordListContent = document.getElementById('word-list-content');
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    document.getElementById('login-btn').addEventListener('click', attemptLogin);
    document.getElementById('signup-btn').addEventListener('click', attemptRegister);
    document.getElementById('guest-play-btn').addEventListener('click', playAsGuest);

    document.getElementById('btn-country-mode').addEventListener('click', startPokemonMode);
    document.getElementById('btn-create-mode').addEventListener('click', showCreatePuzzleScreen);
    document.getElementById('btn-ranking').addEventListener('click', showRankingScreen);
    document.getElementById('btn-word-list').addEventListener('click', showWordListScreen);
    document.getElementById('btn-logout').addEventListener('click', logout);

    document.getElementById('erase-button').addEventListener('click', eraseSelected);
    document.getElementById('reset-button').addEventListener('click', resetGame);
    document.getElementById('btn-back-to-home').addEventListener('click', backToHome);
    
    document.getElementById('btn-input-complete').addEventListener('click', completeCreation);
    document.getElementById('btn-create-back').addEventListener('click', backToHome);

    document.getElementById('btn-ranking-back').addEventListener('click', backToHome);
    document.getElementById('btn-word-list-back').addEventListener('click', backToHome);
}

/**
 * ページロード後の初期化
 */
function init() {
    cacheDOMElements();
    setupEventListeners(); 

    const storedPlayer = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedPlayer) {
        const player = JSON.parse(storedPlayer);
        
        fetchAPI(`/player/${player.id}`)
            .then(result => {
                setPlayer(result.player);
                loadInitialData(); 
            })
            .catch(error => {
                console.error('プレイヤー情報再ロードエラー:', error);
                setPlayer(null); 
                showScreen('auth-screen');
            });

    } else {
        showScreen('auth-screen');
    }
}

document.addEventListener('DOMContentLoaded', init);