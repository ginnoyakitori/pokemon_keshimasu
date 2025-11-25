// keshimasu-server/utils/auth.js
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10; // セキュリティと速度のバランスを考慮した値

/**
 * パスコードをハッシュ化する
 * @param {string} passcode 
 * @returns {Promise<string>} ハッシュ化されたパスコード
 */
async function hashPasscode(passcode) {
    return await bcrypt.hash(passcode, SALT_ROUNDS);
}

/**
 * 入力されたパスコードとハッシュを比較する
 * @param {string} passcode 入力パスコード
 * @param {string} hash DBに保存されているハッシュ
 * @returns {Promise<boolean>} 一致すればtrue
 */
async function comparePasscode(passcode, hash) {
    return await bcrypt.compare(passcode, hash);
}

module.exports = {
    hashPasscode,
    comparePasscode
};