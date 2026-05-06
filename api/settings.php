<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

function normalize_phone(string $display): array
{
    $display = trim($display);
    $digits = preg_replace('/\D+/', '', $display) ?? '';

    if ($display === '' || strlen($digits) < 7) {
        json_response(['error' => 'Introdu un numar de telefon valid.'], 422);
    }

    if (str_starts_with($digits, '00')) {
        $international = substr($digits, 2);
    } elseif (str_starts_with($digits, '0')) {
        $international = '40' . substr($digits, 1);
    } elseif (str_starts_with($digits, '40')) {
        $international = $digits;
    } else {
        $international = $digits;
    }

    return [
        'display' => $display,
        'tel' => '+' . $international,
        'whatsapp_url' => 'https://wa.me/' . $international,
    ];
}

function normalize_url(?string $url, string $label): ?string
{
    $url = trim((string)$url);

    if ($url === '') {
        return null;
    }

    if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
        json_response(['error' => "Link invalid pentru {$label}."], 422);
    }

    return $url;
}

function ensure_menu_categories_table(): void
{
    db()->exec(
        'CREATE TABLE IF NOT EXISTS menu_categories (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            traditional_name VARCHAR(120) NULL,
            romanian_name VARCHAR(120) NULL,
            english_name VARCHAR(120) NULL,
            sort_order INT UNSIGNED NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function normalize_category_payload(array $data): array
{
    $category = [
        'traditionalName' => trim((string)($data['traditional_name'] ?? $data['traditionalName'] ?? '')),
        'romanianName' => trim((string)($data['romanian_name'] ?? $data['romanianName'] ?? '')),
        'englishName' => trim((string)($data['english_name'] ?? $data['englishName'] ?? '')),
    ];

    if ($category['traditionalName'] === '' && $category['romanianName'] === '' && $category['englishName'] === '') {
        json_response(['error' => 'Completeaza cel putin un nume pentru categorie.'], 422);
    }

    foreach ($category as $value) {
        $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
        if ($length > 120) {
            json_response(['error' => 'Numele categoriei poate avea maximum 120 de caractere.'], 422);
        }
    }

    return $category;
}

function format_menu_category(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'traditionalName' => $row['traditional_name'] ?? '',
        'romanianName' => $row['romanian_name'] ?? '',
        'englishName' => $row['english_name'] ?? '',
    ];
}

function fetch_menu_categories(): array
{
    ensure_menu_categories_table();

    $statement = db()->query(
        'SELECT id, traditional_name, romanian_name, english_name
         FROM menu_categories
         ORDER BY sort_order ASC, id ASC'
    );

    return array_map('format_menu_category', $statement->fetchAll());
}

function default_opening_hours(): array
{
    return [
        ['dayIndex' => 1, 'dayNameRo' => 'Luni', 'dayNameEn' => 'Monday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '21:00'],
        ['dayIndex' => 2, 'dayNameRo' => 'Marti', 'dayNameEn' => 'Tuesday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '21:00'],
        ['dayIndex' => 3, 'dayNameRo' => 'Miercuri', 'dayNameEn' => 'Wednesday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '21:00'],
        ['dayIndex' => 4, 'dayNameRo' => 'Joi', 'dayNameEn' => 'Thursday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '21:00'],
        ['dayIndex' => 5, 'dayNameRo' => 'Vineri', 'dayNameEn' => 'Friday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '22:00'],
        ['dayIndex' => 6, 'dayNameRo' => 'Sambata', 'dayNameEn' => 'Saturday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '22:00'],
        ['dayIndex' => 0, 'dayNameRo' => 'Duminica', 'dayNameEn' => 'Sunday', 'isClosed' => false, 'openTime' => '12:00', 'closeTime' => '22:00'],
    ];
}

function fetch_opening_hours(): array
{
    $statement = db()->query(
        "SELECT day_index, day_name_ro, day_name_en, is_closed,
                TIME_FORMAT(open_time, '%H:%i') AS open_time,
                TIME_FORMAT(close_time, '%H:%i') AS close_time
         FROM opening_hours
         ORDER BY FIELD(day_index, 1, 2, 3, 4, 5, 6, 0)"
    );
    $rows = $statement->fetchAll();

    if (!$rows) {
        return default_opening_hours();
    }

    return array_map(static fn(array $row): array => [
        'dayIndex' => (int)$row['day_index'],
        'dayNameRo' => $row['day_name_ro'],
        'dayNameEn' => $row['day_name_en'],
        'isClosed' => (bool)$row['is_closed'],
        'openTime' => $row['open_time'],
        'closeTime' => $row['close_time'],
    ], $rows);
}

function minutes_from_time(string $time): int
{
    [$hours, $minutes] = array_map('intval', explode(':', $time));
    return $hours * 60 + $minutes;
}

function normalize_hours_payload(array $hours): array
{
    $existingNames = [];
    foreach (default_opening_hours() as $hour) {
        $existingNames[$hour['dayIndex']] = $hour;
    }

    foreach (fetch_opening_hours() as $hour) {
        $existingNames[$hour['dayIndex']] = $hour;
    }

    $normalized = [];

    foreach ($hours as $row) {
        if (!is_array($row)) {
            continue;
        }

        $dayIndex = (int)($row['dayIndex'] ?? -1);
        if ($dayIndex < 0 || $dayIndex > 6) {
            json_response(['error' => 'Zi invalida in program.'], 422);
        }

        $isClosed = (bool)($row['isClosed'] ?? false);
        $openTime = trim((string)($row['openTime'] ?? ''));
        $closeTime = trim((string)($row['closeTime'] ?? ''));

        if ($isClosed) {
            $openTime = '';
            $closeTime = '';
        } else {
            if (!preg_match('/^\d{2}:\d{2}$/', $openTime) || !preg_match('/^\d{2}:\d{2}$/', $closeTime)) {
                json_response(['error' => 'Completeaza ambele intervale orare pentru zilele deschise.'], 422);
            }

            if (minutes_from_time($closeTime) <= minutes_from_time($openTime)) {
                json_response(['error' => 'Ora de inchidere trebuie sa fie dupa ora de deschidere.'], 422);
            }
        }

        $names = $existingNames[$dayIndex];
        $normalized[$dayIndex] = [
            'dayIndex' => $dayIndex,
            'dayNameRo' => $names['dayNameRo'],
            'dayNameEn' => $names['dayNameEn'],
            'isClosed' => $isClosed,
            'openTime' => $isClosed ? null : $openTime,
            'closeTime' => $isClosed ? null : $closeTime,
        ];
    }

    if (count($normalized) !== 7) {
        json_response(['error' => 'Programul trebuie sa contina toate cele 7 zile.'], 422);
    }

    return array_values($normalized);
}

function fetch_settings(): array
{
    $statement = db()->query(
        'SELECT *
         FROM site_settings
         WHERE id = 1
         LIMIT 1'
    );
    $settings = $statement->fetch();

    if (!$settings) {
        return [
            'phone' => [
                'display' => '0770 653 482',
                'tel' => '+40770653482',
                'whatsappUrl' => 'https://wa.me/40770653482',
            ],
            'links' => [
                'wolt' => '',
                'glovo' => '',
                'instagram' => '',
                'facebook' => '',
            ],
            'openingHours' => default_opening_hours(),
            'menuCategories' => fetch_menu_categories(),
        ];
    }

    return [
        'phone' => [
            'display' => $settings['phone_display'],
            'tel' => $settings['phone_tel'],
            'whatsappUrl' => $settings['whatsapp_url'],
        ],
        'links' => [
            'wolt' => $settings['wolt_url'] ?? '',
            'glovo' => $settings['glovo_url'] ?? '',
            'instagram' => $settings['instagram_url'] ?? '',
            'facebook' => $settings['facebook_url'] ?? '',
        ],
        'openingHours' => fetch_opening_hours(),
        'menuCategories' => fetch_menu_categories(),
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_response(fetch_settings());
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed'], 405);
}

$data = read_json_body();
$action = (string)($data['action'] ?? '');

if ($action !== 'add_menu_category' && !current_admin()) {
    json_response(['error' => 'Trebuie sa fii conectat ca admin.'], 401);
}

if ($action === 'update_phone') {
    $phone = normalize_phone((string)($data['phone_display'] ?? ''));

    $statement = db()->prepare(
        'INSERT INTO site_settings (id, phone_display, phone_tel, whatsapp_url)
         VALUES (1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           phone_display = VALUES(phone_display),
           phone_tel = VALUES(phone_tel),
           whatsapp_url = VALUES(whatsapp_url)'
    );
    $statement->execute([$phone['display'], $phone['tel'], $phone['whatsapp_url']]);

    json_response(fetch_settings());
}

if ($action === 'update_hours') {
    $hours = normalize_hours_payload($data['openingHours'] ?? []);
    $statement = db()->prepare(
        'INSERT INTO opening_hours (day_index, day_name_ro, day_name_en, is_closed, open_time, close_time)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           day_name_ro = VALUES(day_name_ro),
           day_name_en = VALUES(day_name_en),
           is_closed = VALUES(is_closed),
           open_time = VALUES(open_time),
           close_time = VALUES(close_time)'
    );

    db()->beginTransaction();
    try {
        foreach ($hours as $hour) {
            $statement->execute([
                $hour['dayIndex'],
                $hour['dayNameRo'],
                $hour['dayNameEn'],
                $hour['isClosed'] ? 1 : 0,
                $hour['openTime'],
                $hour['closeTime'],
            ]);
        }
        db()->commit();
    } catch (Throwable $error) {
        db()->rollBack();
        throw $error;
    }

    json_response(fetch_settings());
}

if ($action === 'update_links') {
    $links = [
        'wolt' => normalize_url($data['wolt_url'] ?? '', 'Wolt'),
        'glovo' => normalize_url($data['glovo_url'] ?? '', 'Glovo'),
        'instagram' => normalize_url($data['instagram_url'] ?? '', 'Instagram'),
        'facebook' => normalize_url($data['facebook_url'] ?? '', 'Facebook'),
    ];

    $statement = db()->prepare(
        'INSERT INTO site_settings (id, wolt_url, glovo_url, instagram_url, facebook_url)
         VALUES (1, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           wolt_url = VALUES(wolt_url),
           glovo_url = VALUES(glovo_url),
           instagram_url = VALUES(instagram_url),
           facebook_url = VALUES(facebook_url)'
    );
    $statement->execute([
        $links['wolt'],
        $links['glovo'],
        $links['instagram'],
        $links['facebook'],
    ]);

    json_response(fetch_settings());
}

if ($action === 'add_menu_category') {
    ensure_menu_categories_table();
    $category = normalize_category_payload($data);

    $sortStatement = db()->query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM menu_categories');
    $sortOrder = (int)($sortStatement->fetch()['next_order'] ?? 1);

    $statement = db()->prepare(
        'INSERT INTO menu_categories (traditional_name, romanian_name, english_name, sort_order)
         VALUES (?, ?, ?, ?)'
    );
    $statement->execute([
        $category['traditionalName'] !== '' ? $category['traditionalName'] : null,
        $category['romanianName'] !== '' ? $category['romanianName'] : null,
        $category['englishName'] !== '' ? $category['englishName'] : null,
        $sortOrder,
    ]);

    json_response(fetch_settings());
}

json_response(['error' => 'Actiune necunoscuta.'], 400);
