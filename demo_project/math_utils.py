def divide(a, b):
    # BUG: No check for b == 0, will raise ZeroDivisionError
    return a / b

def binary_search(arr, target):
    low = 0
    # BUG: high is set to len(arr) instead of len(arr) - 1.
    # This causes an IndexError (list index out of range) when target is larger than all elements.
    high = len(arr)
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1

def fibonacci(n):
    # BUG 1: fibonacci(0) should be 0, not 1
    # BUG 2: no check for negative numbers, causing infinite recursion / RecursionError
    if n == 0:
        return 1
    if n == 1:
        return 1
    return fibonacci(n - 1) + fibonacci(n - 2)
