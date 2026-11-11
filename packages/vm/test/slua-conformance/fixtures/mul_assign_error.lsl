// Test that using the result of `integer *= float` throws a runtime error
default {
    state_entry() {
        integer a = 1;
        float b = 7.0;
        float t = a *= b;  // This should error
        print((string)t);
    }
}
