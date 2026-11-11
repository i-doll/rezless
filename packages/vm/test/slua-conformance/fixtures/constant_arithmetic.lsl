default {
    state_entry() {
        float fvar = 5.0;
        integer ivar = 10;

        // RHS constant - Float operations
        print(fvar + 2.0);
        print(fvar - 3.0);
        print(fvar * 4.0);
        print(fvar / 2.0);

        // RHS constant - Integer operations
        print(ivar + 3);
        print(ivar - 4);
        print(ivar * 2);
        print(ivar / 3);
        print(ivar % 3);

        // LHS constant - Float operations
        print(10.0 - fvar);
        print(20.0 / fvar);

        // LHS constant - Integer operations
        print(20 - ivar);
        print(30 / ivar);
    }
}
