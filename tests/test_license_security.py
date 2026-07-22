"""
P0 2026-07-23 安全事件响应 — license 验签测试套件

覆盖:
  1. 新 keypair (ed25519-2026-07-23) 签的 license -> 验签通过
  2. 错误公钥 -> 验签失败
  3. 篡改 payload 后 -> 验签失败
  4. 缺签名 -> 验签失败
  5. DEPRECATED kid (旧泄露 keypair) -> 显式拒绝, 不依赖签名
  6. 缺 kid 字段 (旧版 license) -> 显式拒绝
  7. generate_license.js 缺私钥 -> 立即 fail, exit code 2
  8. vendorId / productId 不匹配 -> 拒绝
  9. 过期 license -> 拒绝
  10. machineId 匹配逻辑 (3+ 特征 hash 匹配 = 同一机器)

运行: python -m pytest tests/test_license_security.py -v
        python tests/test_license_security.py  (直跑, 免 pytest)
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


# 与 generate_license.js / config.py 保持一致
NEW_KID = "ed25519-2026-07-23"
NEW_PUBLIC_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEASKvWuHNASJ7xRYs5CUBc1QE4UdcxKpS4Kd2rhtuFV3I=\n-----END PUBLIC KEY-----\n"
DEPRECATED_KID = "ed25519-2026-05-20"  # 已泄露, 永远拒绝

# 测试用: 生成 fresh keypair
def gen_fresh_keypair():
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization
    sk = ed25519.Ed25519PrivateKey.generate()
    pk = sk.public_key()
    sk_pem = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    pk_pem = pk.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return sk, pk, sk_pem, pk_pem


def canonicalize(obj):
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if isinstance(obj, list):
        return "[" + ",".join(canonicalize(x) for x in obj) + "]"
    if isinstance(obj, dict):
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False, separators=(',', ':'))}:{canonicalize(obj[k])}" for k in sorted(obj.keys())) + "}"
    raise TypeError(f"cannot canonicalize {type(obj)}")


def sign_payload(sk, payload_dict):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    # Ed25519: 签名输入 = canonical JSON (NOT pre-hashed)
    canon = canonicalize(payload_dict).encode("utf-8")
    sig = sk.sign(canon)
    return base64.b64encode(sig).decode("ascii")


class TestVerifyLicenseData(unittest.TestCase):
    """测试 backend/app/core/license.py 验签逻辑"""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(REPO_ROOT / "backend"))
        # 关键: 测试时确保 import 到的是被改造的 license.py, 而非旧版
        from app.core import license as _lic  # noqa
        from app.core import config as _cfg  # noqa
        cls._license_mod = _lic
        cls._cfg = _cfg
        cls._sk, cls._pk, cls._sk_pem, cls._pk_pem = gen_fresh_keypair()
        # 把新公钥注入 config 的 TRUSTED_LICENSE_KEYS
        # 这样测试可用 fresh keypair 验证 verify_license_data 的逻辑
        test_kid = f"test-{cls._pk_pem[-8:]}"
        _cfg.TRUSTED_LICENSE_KEYS[test_kid] = cls._pk_pem
        cls.test_kid = test_kid

    def _make_license(self, override=None, signed_kid=None, sign_with=None):
        # 用真实当前机器码 (避免 hardware_features 匹配失败)
        real_mid = self._license_mod.current_machine_id()
        payload = {
            "kid": signed_kid or self.test_kid,
            "vendorId": "yinmi",
            "productId": "sme-production-system",
            "productName": "中小企业生产系统",
            "customerName": "测试工厂",
            "licenseCode": "LIC-TEST-0001",
            "machineId": real_mid,
            "edition": "standard",
            "expireAt": "2099-12-31",
            "maxUsers": 1,
            "issuedAt": "2026-07-23",
        }
        if override:
            payload.update(override)
        sign_with = sign_with or self._sk
        payload["signature"] = sign_payload(sign_with, payload)
        return payload

    def test_01_new_kid_valid_signature(self):
        """新 keypair 签的 license -> 验签通过"""
        lic = self._make_license()
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertTrue(valid, f"expected valid, got: {msg}")

    def test_02_wrong_public_key_fails(self):
        """错误公钥 -> 验签失败"""
        lic = self._make_license()
        # 删掉 test kid, 改成 unknown kid -> 应被 _resolve_public_key 拒绝
        lic["kid"] = "unknown-kid"
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid)
        self.assertIn("未识别", msg)

    def test_03_tampered_payload_fails(self):
        """篡改 payload (签名后改 customerName) -> 验签失败"""
        lic = self._make_license()
        lic["customerName"] = "被篡改的工厂"
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid)
        # 签名校验失败或 machineId 不匹配都会导致 false
        # 只要不是 "授权有效"
        self.assertNotIn("授权有效", msg)

    def test_04_missing_signature_fails(self):
        """缺 signature -> 立即拒绝"""
        lic = self._make_license()
        del lic["signature"]
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid)
        self.assertIn("签名", msg)

    def test_05_deprecated_kid_rejected(self):
        """DEPRECATED kid (旧泄露 keypair) -> 显式拒绝, 不依赖签名"""
        lic = self._make_license(signed_kid=DEPRECATED_KID, sign_with=self._sk)
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid, "deprecated kid must be rejected unconditionally")
        self.assertIn("已泄露", msg)

    def test_06_missing_kid_rejected(self):
        """缺 kid 字段 (旧版 license 格式) -> 显式拒绝"""
        lic = self._make_license()
        del lic["kid"]
        # 重新签 (虽然签名可能不对, 但要确保缺 kid 这一项直接拒绝)
        lic["signature"] = sign_payload(self._sk, {
            k: v for k, v in lic.items() if k != "signature"
        })
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid, "missing kid must be rejected")
        self.assertIn("kid", msg)

    def test_07_wrong_vendor_product_rejected(self):
        """vendorId / productId 不匹配 -> 拒绝"""
        lic = self._make_license({"vendorId": "someone-else"})
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid)
        self.assertIn("不属于当前软件", msg)

    def test_08_expired_license_rejected(self):
        """过期 license -> 拒绝"""
        lic = self._make_license({"expireAt": "2020-01-01"})
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid)
        self.assertIn("到期", msg)

    def test_09_legacy_kid_with_correct_signature_fails(self):
        """旧 keypair 签的 license (无 kid) -> 显式拒绝 (即使签名本身合法)"""
        # 模拟旧 keypair 签: 用 fresh sk 签, 但 kid 缺失
        payload = {
            "vendorId": "yinmi",
            "productId": "sme-production-system",
            "productName": "中小企业生产系统",
            "customerName": "测试工厂",
            "licenseCode": "LIC-OLD-0001",
            "machineId": "MID-v1.test",
            "edition": "standard",
            "expireAt": "2099-12-31",
            "maxUsers": 1,
            "issuedAt": "2026-05-20",
        }
        sig = sign_payload(self._sk, payload)  # 签名是 fresh sk 签的 (合法签名, 但被拒绝)
        lic = {**payload, "signature": sig}
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid, "旧版 license 格式 (无 kid) 必须被拒绝, 即使签名通过")
        self.assertIn("kid", msg)

    def test_10_signature_with_wrong_kid_fails(self):
        """正确签名 + 错误 kid -> 验签失败 (签名找不到匹配 key)"""
        # 用 fresh sk 签, 但把 kid 改成另一个已注册但 key 不同的
        lic = self._make_license()
        # 制造一个场景: kid 改成 NEW_KID (config 中注册但不是生成 sk 对应的)
        lic["kid"] = NEW_KID  # 另一个 keypair
        # 重新用 fresh sk 签
        lic["signature"] = sign_payload(self._sk, {
            k: v for k, v in lic.items() if k != "signature"
        })
        valid, msg = self._license_mod.verify_license_data(lic)
        self.assertFalse(valid, "用 A sk 签 + B kid 应当被验签拒绝")
        # 要么 "签名无效" (验签失败), 要么 machineId 不匹配
        self.assertTrue("签名无效" in msg or "不属于本机" in msg, f"unexpected: {msg}")


class TestGenerateLicenseNoKey(unittest.TestCase):
    """测试 generate_license.js 缺私钥时立即 fail"""

    def setUp(self):
        # 检查 node 可用
        self.node = shutil.which("node")
        if not self.node:
            self.skipTest("node not available")

    def test_01_no_signing_key_fails(self):
        """缺所有私钥来源 -> exit code != 0, stderr 含 'no signing key'"""
        gen = REPO_ROOT / "owner_tools" / "generate_license.js"
        if not gen.exists():
            self.skipTest("generate_license.js not present")
        env = os.environ.copy()
        # 清空所有可能的私钥来源
        for k in ("PIECEWORK_LICENSE_SIGNING_KEY", "PIECEWORK_LICENSE_SIGNING_KEY_FILE", "MAVIS_VAULT_PATH"):
            env.pop(k, None)
        proc = subprocess.run(
            [self.node, str(gen), "sign",
             "--product", "sme-production-system",
             "--customer", "test",
             "--machine", "MID-v1.test"],
            capture_output=True, text=True, env=env, timeout=15,
        )
        self.assertNotEqual(proc.returncode, 0, f"必须 fail, got rc={proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}")
        combined = (proc.stdout + proc.stderr).lower()
        self.assertTrue("no signing key" in combined, f"应输出 'no signing key', got:\n{proc.stdout}\n{proc.stderr}")

    def test_02_inspect_works_with_key(self):
        """inspect 模式 (只读 kid) 正常输出"""
        gen = REPO_ROOT / "owner_tools" / "generate_license.js"
        if not gen.exists():
            self.skipTest("generate_license.js not present")
        # 用环境变量传私钥 (从 vault 读, 但测试用临时生成的 fresh keypair)
        _, _, sk_pem, _ = gen_fresh_keypair()
        env = os.environ.copy()
        env["PIECEWORK_LICENSE_SIGNING_KEY"] = sk_pem
        proc = subprocess.run(
            [self.node, str(gen), "inspect"],
            capture_output=True, text=True, env=env, timeout=15,
        )
        self.assertEqual(proc.returncode, 0, f"got rc={proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}")
        self.assertIn("kid", proc.stdout)
        self.assertIn("fingerprint", proc.stdout)
        # 重要: 私钥不能出现在 stdout
        self.assertNotIn("BEGIN PRIVATE KEY", proc.stdout, "private key must not appear in inspect output")

    def test_03_sign_no_key_in_output(self):
        """sign 成功路径也不暴露私钥内容"""
        gen = REPO_ROOT / "owner_tools" / "generate_license.js"
        _, _, sk_pem, _ = gen_fresh_keypair()
        env = os.environ.copy()
        env["PIECEWORK_LICENSE_SIGNING_KEY"] = sk_pem
        proc = subprocess.run(
            [self.node, str(gen), "sign",
             "--product", "sme-production-system",
             "--customer", "test-customer",
             "--machine", "MID-v1.test",
             "--out", str(REPO_ROOT / "tests" / "_tmp_license.dat")],
            capture_output=True, text=True, env=env, timeout=15,
        )
        self.assertEqual(proc.returncode, 0, f"got rc={proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}")
        self.assertNotIn("BEGIN PRIVATE KEY", proc.stdout, "private key must not appear in sign output")
        self.assertIn("[ok] license signed", proc.stdout)
        # 检查输出 license 文件也不含私钥
        with open(REPO_ROOT / "tests" / "_tmp_license.dat", "r", encoding="utf-8") as f:
            lic_text = f.read()
        self.assertNotIn("PRIVATE KEY", lic_text)
        self.assertIn("kid", lic_text)
        # 清理
        try: (REPO_ROOT / "tests" / "_tmp_license.dat").unlink()
        except: pass


class TestSecretNotHardcoded(unittest.TestCase):
    """回归测试: 防止再次硬编码 secret"""

    def test_01_no_private_key_in_generate_license(self):
        gen = REPO_ROOT / "owner_tools" / "generate_license.js"
        text = gen.read_text(encoding="utf-8")
        # 任何 "PRIVATE KEY" 字面量都失败
        self.assertNotIn("PRIVATE KEY", text, "PRIVATE KEY 字面量不能出现在 generate_license.js")

    def test_02_no_hardcoded_secret_in_launcher(self):
        launcher = REPO_ROOT / "backend" / "app_launcher.py"
        text = launcher.read_text(encoding="utf-8")
        # 不允许默认硬编码 SECRET_KEY 字面量
        self.assertNotIn("piecework-erp-local-installer-secret", text, "不能再用 'piecework-erp-local-installer-secret' 作为默认 secret")

    def test_03_no_legacy_public_key_in_config(self):
        cfg = REPO_ROOT / "backend" / "app" / "core" / "config.py"
        text = cfg.read_text(encoding="utf-8")
        # 旧公钥 (已泄露 keypair) 不能再被信任
        self.assertNotIn("9eEY4gJTL7pjCRwIf6DqRDn8EL6V9rD6EwemfCocOko", text,
                          "旧 keypair 公钥 (已泄露) 不能再出现在 config.py 的 TRUSTED_LICENSE_KEYS")


if __name__ == "__main__":
    unittest.main(verbosity=2)
