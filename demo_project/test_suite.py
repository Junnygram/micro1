import unittest
from demo_project.math_utils import divide, binary_search, fibonacci
from demo_project.cart import calculate_total, apply_shipping
from demo_project.data_parser import parse_user_age, format_date

class TestMathUtils(unittest.TestCase):
    def test_divide_normal(self):
        self.assertEqual(divide(10, 2), 5.0)

    def test_divide_by_zero(self):
        # We expect a ValueError to be raised for division by zero
        with self.assertRaises(ValueError):
            divide(10, 0)

    def test_binary_search_found(self):
        self.assertEqual(binary_search([1, 3, 5, 7, 9], 5), 2)

    def test_binary_search_not_found(self):
        # Searching for a target larger than all elements
        self.assertEqual(binary_search([1, 3, 5, 7, 9], 10), -1)

    def test_fibonacci_zero(self):
        self.assertEqual(fibonacci(0), 0)

    def test_fibonacci_negative(self):
        # Fibonacci should raise ValueError for negative numbers
        with self.assertRaises(ValueError):
            fibonacci(-5)


class TestCart(unittest.TestCase):
    def test_cart_discount(self):
        # 10% discount on a total of 100 should equal 90
        items = [{"price": 100.0, "quantity": 1}]
        self.assertEqual(calculate_total(items, 10.0), 90.0)

    def test_cart_empty(self):
        # Empty cart should equal 0.0
        self.assertEqual(calculate_total([]), 0.0)

    def test_shipping_unsupported(self):
        # Expect ValueError when country is unsupported
        with self.assertRaises(ValueError):
            apply_shipping(100.0, "FR")


class TestDataParser(unittest.TestCase):
    def test_parser_age_missing(self):
        # Expect ValueError when age field is missing
        with self.assertRaises(ValueError):
            parse_user_age({"name": "Alice"})

    def test_parser_date_format(self):
        # Expect ValueError when date is in invalid format
        with self.assertRaises(ValueError):
            format_date("2026/08/28")

if __name__ == "__main__":
    unittest.main()
