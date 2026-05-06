<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $admin = current_admin();

    json_response([
        'authenticated' => $admin !== null,
        'admin' => $admin,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed'], 405);
}

$data = read_json_body();
$action = (string)($data['action'] ?? '');

if ($action === 'login') {
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');

    if ($username === '' || $password === '') {
        json_response(['error' => 'Completeaza emailul si parola.'], 422);
    }

    $statement = db()->prepare('SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1');
    $statement->execute([$username]);
    $admin = $statement->fetch();

    if (!$admin || !password_verify($password, $admin['password_hash'])) {
        json_response(['error' => 'Email sau parola gresita.'], 401);
    }

    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int)$admin['id'];

    json_response([
        'authenticated' => true,
        'admin' => [
            'id' => (int)$admin['id'],
            'username' => $admin['username'],
        ],
    ]);
}

if ($action === 'logout') {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            [
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => (bool)$params['secure'],
                'httponly' => (bool)$params['httponly'],
                'samesite' => $params['samesite'] ?? 'Lax',
            ]
        );
    }

    session_destroy();

    json_response(['authenticated' => false, 'admin' => null]);
}

json_response(['error' => 'Actiune necunoscuta.'], 400);
