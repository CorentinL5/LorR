<?php
declare(strict_types=1);

final class LegacyGuestPlanning
{
    private const MAX_DOCUMENT = 12 * 1024 * 1024;
    private readonly string $sessionIv;
    private readonly string $uuid;
    public readonly int $session;

    public function __construct(string $bootstrap, string $sessionIv)
    {
        if (!preg_match('/\A\{\s*a\s*:\s*2\s*,\s*b\s*:\s*[0-9]+\s*,\s*c\s*:\s*[\'"][A-Z_.]+[\'"]\s*,\s*i\s*:\s*([\'"])([1-9][0-9]{0,18})\1\s*(?=,|\})/', $bootstrap, $session)
            || !preg_match('/,\s*MR\s*:\s*([\'"])([0-9a-f]{256,1024})\1\s*(?=,|\})/i', $bootstrap, $modulus)
            || !preg_match('/,\s*ER\s*:\s*([\'"])0*([1-9a-f][0-9a-f]{0,7})\1\s*(?=,|\})/i', $bootstrap, $exponent)
            || !filter_var($session[2], FILTER_VALIDATE_INT) || !function_exists('gzdeflate') || !function_exists('gzinflate')) {
            throw new RuntimeException('Impossible d’ouvrir une session invitée.');
        }
        $this->session = (int) $session[2];
        $this->sessionIv = $sessionIv;

        $rsa = self::der(0x30, self::integer($modulus[2]) . self::integer($exponent[2]));
        $rsaAlgorithm = hex2bin('300d06092a864886f70d0101010500');
        $key = self::der(0x30, $rsaAlgorithm . self::der(0x03, "\0" . $rsa));
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($key), 64, "\n") . "-----END PUBLIC KEY-----\n";
        if (!@openssl_public_encrypt($sessionIv, $encrypted, $pem, OPENSSL_PKCS1_PADDING)) {
            throw new RuntimeException('Impossible de préparer la session invitée.');
        }
        $this->uuid = rtrim(chunk_split(base64_encode($encrypted), 64, "\r\n"));
    }

    private static function der(int $tag, string $value): string
    {
        $length = strlen($value);
        if ($length < 128) {
            return chr($tag) . chr($length) . $value;
        }
        $encodedLength = ltrim(pack('N', $length), "\0");
        return chr($tag) . chr(0x80 | strlen($encodedLength)) . $encodedLength . $value;
    }

    private static function integer(string $hex): string
    {
        $bytes = ltrim(hex2bin((strlen($hex) % 2 ? '0' : '') . $hex), "\0");
        if ($bytes === '' || (ord($bytes[0]) & 0x80)) {
            $bytes = "\0" . $bytes;
        }
        return self::der(0x02, $bytes);
    }

    private function encrypt(string $plain, bool $initial, bool $compress): string
    {
        $wire = $compress ? gzdeflate(bin2hex($plain)) : $plain;
        $iv = $initial ? str_repeat("\0", 16) : md5($this->sessionIv, true);
        $encrypted = $wire === false ? false : openssl_encrypt($wire, 'aes-128-cbc', md5('', true), OPENSSL_RAW_DATA, $iv);
        if ($encrypted === false) {
            throw new RuntimeException('Impossible de préparer la requête invitée.');
        }
        return strtoupper(md5($plain)) . bin2hex($encrypted);
    }

    public function sequence(int $order): string
    {
        return $this->encrypt((string) $order, $order === 1, false);
    }

    public function request(string $method, string $number, ?array $data, ?array $signature, bool $initial): array
    {
        $parameters = [];
        if ($signature !== null) {
            $parameters['_Signature_'] = $signature;
        }
        if ($data !== null) {
            if ($initial) {
                $data = ['ModeJeton' => false, 'Uuid' => $this->uuid];
            }
            $parameters['donnees'] = $data;
        }
        return [
            'session' => $this->session,
            'numeroOrdre' => $number,
            'nom' => $method,
            'donneesSec' => $this->encrypt(json_encode((object) $parameters, JSON_THROW_ON_ERROR), $initial, true),
        ];
    }

    public function response(string $method, int $order, mixed $response): array
    {
        $sequence = $response['numeroOrdre'] ?? null;
        $secured = $response['donneesSec'] ?? null;
        if (($response['session'] ?? null) !== $this->session || ($response['nom'] ?? null) !== $method
            || !is_string($sequence) || !hash_equals(strtolower($this->sequence($order)), strtolower($sequence))
            || !is_string($secured) || !preg_match('/\A[0-9a-f]+\z/i', $secured) || strlen($secured) % 32 !== 0) {
            throw new RuntimeException('L’espace invité a renvoyé une réponse inattendue.');
        }
        $plain = openssl_decrypt(hex2bin(substr($secured, 32)), 'aes-128-cbc', md5('', true),
            OPENSSL_RAW_DATA, md5($this->sessionIv, true));
        $data = $plain === false ? false : @gzinflate($plain, self::MAX_DOCUMENT);
        if ($data === false || !hash_equals(strtolower(substr($secured, 0, 32)), md5($data))) {
            throw new RuntimeException('L’espace invité a renvoyé une réponse inattendue.');
        }
        $decoded = json_decode($data, true, 40, JSON_THROW_ON_ERROR);
        if (!empty($decoded['Erreur']) || !is_array($decoded['donnees'] ?? null)) {
            throw new RuntimeException('L’espace invité n’a pas publié les horaires demandés.');
        }
        return $decoded['donnees'];
    }
}
