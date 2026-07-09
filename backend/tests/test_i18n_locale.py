import unittest

from app.core.i18n_messages import resolve_locale


class ResolveLocaleTests(unittest.TestCase):
    def test_explicit_wins(self):
        self.assertEqual(resolve_locale("en-US", explicit="id"), "id")
        self.assertEqual(resolve_locale("id-ID", explicit="en"), "en")

    def test_default_english(self):
        self.assertEqual(resolve_locale(None), "en")
        self.assertEqual(resolve_locale(""), "en")

    def test_english_header_with_id_fallback_stays_english(self):
        # Real FE header for English UI — previously mis-detected as id via ",id" substring.
        self.assertEqual(
            resolve_locale("en-US,en;q=0.9,id;q=0.8"),
            "en",
        )

    def test_indonesian_preferred(self):
        self.assertEqual(resolve_locale("id-ID,id;q=0.9,en;q=0.8"), "id")
        self.assertEqual(resolve_locale("id"), "id")

    def test_quality_order(self):
        self.assertEqual(resolve_locale("en;q=0.2,id;q=0.8"), "id")
        self.assertEqual(resolve_locale("id;q=0.1,en;q=0.9"), "en")


if __name__ == "__main__":
    unittest.main()
