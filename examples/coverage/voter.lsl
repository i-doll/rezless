// A toy LSL script demonstrating coverage reporting.
//
// State_entry sets up listening; positive integers on channel 5 increment a
// counter, negatives decrement it, and the magic number 42 transitions to
// the `done` state. The `reset` user function is left untested so coverage
// reports can show it as missed.

integer score = 0;

reset()
{
    score = 0;
    llSay(0, "score reset");
}

bump(integer delta)
{
    if (delta > 0)
    {
        score = score + delta;
    }
    else
    {
        score = score - 1;
    }
}

default
{
    state_entry()
    {
        llListen(5, "", NULL_KEY, "");
    }

    listen(integer channel, string name, key id, string message)
    {
        integer n = (integer)message;
        if (n == 42)
        {
            state done;
        }
        bump(n);
        llSay(0, (string)score);
    }
}

state done
{
    state_entry()
    {
        llSay(0, "done");
    }
}
