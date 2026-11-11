// Test that integer division by zero throws a runtime error
default {
    state_entry() {
        integer a = 1;
        integer b = 0;
        integer c = a / b;  // This should error
        print((string)c);
    }
}
