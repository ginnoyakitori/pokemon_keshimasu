// =========================================================================
// 🌐 グローバル定数と変数
// =========================================================================

// サーバーURL
const API_BASE_URL = 'https://pokemon-keshimasu.onrender.com/api'; 
const BOARD_ROWS = 8;
const BOARD_COLS = 5;
const GAME_MODE = 'pokemon'; // 現在のモードを固定
const LOCAL_STORAGE_KEY = 'pokemonKeshimasuPlayer';

// プレイヤー情報とゲーム状態
let currentPlayer = null;
let currentPuzzles = []; // サーバーから取得した全問題リスト
let currentPuzzleIndex = 0;
let clearedPuzzleIds = [];
let availableWords = new Set(); // 判定に使うポケモン名リスト

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
 * ログインを試行する (login-btnが使用)
 */
function attemptLogin() {
    attemptAuth(false);
}

/**
 * 新規登録を試行する (signup-btnが使用)
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
    
    // UIを更新してホーム画面へ
    updateWelcomeMessage();
    showScreen('home-screen');
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
        dom.problemCountDisplay.textContent = `未クリア問題数: ${currentPuzzles.length - clearedPuzzleIds.length}問 (全 ${currentPuzzles.length}問)`;
        
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
        dom.welcomeMessage.textContent = `${currentPlayer.nickname}さんのスコア: ${currentPlayer.pokemon_clears || 0}クリア！`;
    } else {
        dom.welcomeMessage.textContent = 'ゲストプレイヤーとして楽しめます。';
    }
}


// =========================================================================
// 🎮 ゲームプレイロジック (ダミー/プレースホルダー)
// =========================================================================

/**
 * ポケモンケシマスを開始する
 */
function startPokemonMode() {
    // 未クリアの問題を探す
    const unclearedPuzzles = currentPuzzles.filter(p => !clearedPuzzleIds.includes(p.id));
    
    if (unclearedPuzzles.length === 0) {
        alert('全てのポケモンケシマス問題をクリアしました！新しい問題が追加されるまでお待ちください。');
        return;
    }

    // 最も古い未クリア問題を取得 (サーバーがcreated_at ASCで返している前提)
    const nextPuzzle = unclearedPuzzles[0];
    currentPuzzleIndex = currentPuzzles.findIndex(p => p.id === nextPuzzle.id);

    // ゲーム盤面を初期化
    initializeGameBoard(nextPuzzle.data, nextPuzzle.id); 

    // UI更新
    dom.currentGameTitle.textContent = `第 ${currentPuzzleIndex + 1} 問`;
    dom.creatorDisplay.textContent = `制作者: ${nextPuzzle.creator || '名無し'}`;
    dom.usedWordsDisplay.textContent = 'なし';
    
    showScreen('main-game-screen');
}

/**
 * ゲーム盤面を初期化する (ダミー)
 */
function initializeGameBoard(boardData) {
    dom.board.innerHTML = '';
    // ダミーのセル生成（実際はboardDataを使って生成するロジックが必要）
    for (let i = 0; i < BOARD_ROWS * BOARD_COLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'board-cell';
        cell.textContent = String.fromCharCode(65 + (i % 26)); // A, B, C... (ダミー文字)
        dom.board.appendChild(cell);
    }
    // 実際にゲームロジックで使う変数をリセット (例: currentBoardState = boardData)
    // selection = [];
    // usedWords = [];
}

/**
 * 選択された文字を消去する (ダミー)
 */
function eraseSelected() {
    alert('消去処理を実行します (ロジック未実装)');
    // 1. 選択が有効かチェック
    // 2. 選択された文字列が availableWords に存在するかチェック
    // 3. 存在し、未クリアなら、スコア更新APIを呼び出す
    if (currentPlayer) {
        submitScore(currentPuzzles[currentPuzzleIndex].id);
    }
    // 4. 盤面を更新
    // 5. クリア判定
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
 * クリア時にスコアをサーバーに送信する (ダミー)
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
        
        setPlayer(currentPlayer); // ローカルストレージも更新
        
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
        // GET /api/rankings/:type ルート (server.jsで定義済み)
        const rankings = await fetchAPI(`/rankings/${GAME_MODE}`); 
        
        // 自分のスコア表示
        if (currentPlayer) {
            const playerRank = rankings.find(r => r.nickname === currentPlayer.nickname);
            dom.rankingNicknameDisplay.textContent = `あなたの記録: ${playerRank ? `${playerRank.rank}位 (${playerRank.score}クリア)` : `未ランクイン (${currentPlayer.pokemon_clears || 0}クリア)`}`;
        } else {
            dom.rankingNicknameDisplay.textContent = 'あなたの記録: ゲスト (スコア非保存)';
        }

        // ランキングリストの生成
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
 * 問題制作画面を表示 (ダミー)
 */
function showCreatePuzzleScreen() {
    showScreen('create-puzzle-screen');
    dom.createStatus.textContent = '残り40マスに入力が必要です。';
    dom.createBoard.innerHTML = ''; // ボードをリセット
    // 制作ボードの初期化ロジック (input要素の生成など) が必要
}

/**
 * 問題制作完了時に実行 (ダミー)
 */
function completeCreation() {
    alert('問題制作完了と登録処理を実行します (ロジック未実装)');
    // 1. ボードデータを取得し、バリデーション
    // 2. APIで /api/puzzles に登録
    // 3. 成功後、ホーム画面に戻る
    backToHome();
}

/**
 * ホーム画面に戻る
 */
function backToHome() {
    showScreen('home-screen');
}


// =========================================================================
// ✨ 初期化処理とイベントリスナー設定
// =========================================================================

/**
 * DOM要素のキャッシュと初期ロード
 */
function cacheDOMElements() {
    // 認証
    dom.nicknameInput = document.getElementById('nickname-input');
    dom.passcodeInput = document.getElementById('passcode-input');
    // ホーム
    dom.welcomeMessage = document.getElementById('welcome-message');
    dom.problemCountDisplay = document.getElementById('country-problem-count');
    // ゲーム
    dom.board = document.getElementById('board');
    dom.currentGameTitle = document.getElementById('current-game-title');
    dom.creatorDisplay = document.getElementById('creator-display');
    dom.usedWordsDisplay = document.getElementById('used-words-display');
    // 作成
    dom.createBoard = document.getElementById('create-board');
    dom.createStatus = document.getElementById('create-status');
    // ランキング
    dom.rankingListContainer = document.getElementById('ranking-list-container');
    dom.rankingNicknameDisplay = document.getElementById('ranking-nickname-display');
    // ワードリスト
    dom.wordListModeDisplay = document.getElementById('word-list-mode-display');
    dom.wordListContent = document.getElementById('word-list-content');
}

/**
 * ページロード後の初期化
 */
function init() {
    cacheDOMElements();

    const storedPlayer = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedPlayer) {
        // プレイヤー情報があれば再ロード
        const player = JSON.parse(storedPlayer);
        
        // サーバーから最新情報を取得し、ホームへ
        fetchAPI(`/player/${player.id}`)
            .then(result => {
                setPlayer(result.player);
                loadInitialData();
            })
            .catch(error => {
                console.error('プレイヤー情報再ロードエラー:', error);
                setPlayer(null); // エラー時はゲスト扱い/認証画面へ
                showScreen('auth-screen');
            });

    } else {
        showScreen('auth-screen');
    }
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    // 認証画面
    document.getElementById('login-btn').addEventListener('click', attemptLogin);
    document.getElementById('signup-btn').addEventListener('click', attemptRegister);
    document.getElementById('guest-play-btn').addEventListener('click', playAsGuest);

    // ホーム画面
    document.getElementById('btn-country-mode').addEventListener('click', startPokemonMode);
    document.getElementById('btn-create-mode').addEventListener('click', showCreatePuzzleScreen);
    document.getElementById('btn-ranking').addEventListener('click', showRankingScreen);
    document.getElementById('btn-word-list').addEventListener('click', showWordListScreen);
    document.getElementById('btn-logout').addEventListener('click', logout);

    // メインゲーム画面
    document.getElementById('erase-button').addEventListener('click', eraseSelected);
    document.getElementById('reset-button').addEventListener('click', resetGame);
    document.getElementById('btn-back-to-home').addEventListener('click', backToHome);
    
    // 作成画面
    document.getElementById('btn-input-complete').addEventListener('click', completeCreation);
    document.getElementById('btn-create-back').addEventListener('click', backToHome);

    // ランキング/ワードリスト画面
    document.getElementById('btn-ranking-back').addEventListener('click', backToHome);
    document.getElementById('btn-word-list-back').addEventListener('click', backToHome);

    // 盤面セルクリックイベント (ダミー)
    // dom.board.addEventListener('click', handleCellClick); 
}

// ページが完全にロードされたら初期化とイベント設定を実行
document.addEventListener('DOMContentLoaded', () => {
    // setupEventListeners() を呼び出す前に init() を呼び出すことで、DOM要素を確実にキャッシュ
    // ただし、init() の中で setPlayer() を通じて showScreen() が呼ばれるため、
    // ここで setupEventListeners() を呼び出すのが安全
    init();
    setupEventListeners();
});

// =========================================================================
// (他のゲームロジック関数が続く...)
// =========================================================================