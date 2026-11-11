// Test that Infinity / Infinity throws a runtime error (NaN result)
default {
    state_entry() {
        float inf = (float)"inf";
        float result = inf / inf;  // This should error
        print((string)result);
    }
}
