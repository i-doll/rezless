// Test that zero vector division by zero throws a runtime error
default {
    state_entry() {
        vector v = <0, 0, 0> / 0;  // This should error
        print((string)v);
    }
}
