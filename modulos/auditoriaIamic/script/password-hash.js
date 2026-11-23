// === HASH DE SENHAS (PBKDF2-SHA256 via Web Crypto) ===
// As senhas no nó /passwords deixam de ficar em texto puro. Formato gravado:
//   pbkdf2$<iterações>$<salt base64>$<hash base64>
// Cada usuário tem salt próprio, então senhas iguais geram hashes diferentes.
// Registros antigos em texto puro continuam aceitos no login e são convertidos
// por migratePlainPasswords() logo após o primeiro login bem-sucedido.

    const PW_HASH_PREFIX = 'pbkdf2$';
    const PW_HASH_ITERATIONS = 100000;

    function _pwBytesToB64(bytes) {
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        return btoa(bin);
    }

    function _pwB64ToBytes(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    async function _pwDerive(plain, saltBytes, iterations) {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(plain)), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
        return new Uint8Array(bits);
    }

    function isPasswordHashed(stored) {
        return typeof stored === 'string' && stored.startsWith(PW_HASH_PREFIX);
    }

    async function hashPassword(plain) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await _pwDerive(plain, salt, PW_HASH_ITERATIONS);
        return `${PW_HASH_PREFIX}${PW_HASH_ITERATIONS}$${_pwBytesToB64(salt)}$${_pwBytesToB64(hash)}`;
    }

    async function verifyPassword(plain, stored) {
        stored = String(stored || '');
        if (!isPasswordHashed(stored)) return stored !== '' && stored === String(plain);
        const parts = stored.split('$');
        if (parts.length !== 4) return false;
        const iterations = parseInt(parts[1], 10);
        if (!iterations) return false;
        const expected = _pwB64ToBytes(parts[3]);
        const actual = await _pwDerive(plain, _pwB64ToBytes(parts[2]), iterations);
        if (actual.length !== expected.length) return false;
        let diff = 0;
        for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
        return diff === 0;
    }

    // Converte todas as senhas ainda em texto puro. Os hashes são calculados fora da
    // transação (Web Crypto é assíncrono) e só substituem a entrada se ela ainda
    // tiver exatamente a senha que foi hasheada — uma edição concorrente vence.
    async function migratePlainPasswords() {
        if (typeof users === 'undefined' || !Array.isArray(users)) return;
        const pending = users.filter(u => u && u.id && u.password && !isPasswordHashed(u.password));
        if (pending.length === 0) return;

        const hashes = new Map();
        for (const u of pending) hashes.set(u.id, { plain: String(u.password), hash: await hashPassword(u.password) });

        const database = getFirebaseDatabase();
        const dbRef = getFirebaseRef();
        const runTransaction = getFirebaseRunTransaction();
        await runTransaction(dbRef(database, 'passwords'), (cur) => {
            if (!Array.isArray(cur)) return cur;
            cur.forEach(entry => {
                const h = entry && hashes.get(entry.id);
                if (h && String(entry.password || '') === h.plain) entry.password = h.hash;
            });
            return cur;
        });

        users.forEach(u => {
            const h = hashes.get(u.id);
            if (h && String(u.password) === h.plain) u.password = h.hash;
        });
    }
