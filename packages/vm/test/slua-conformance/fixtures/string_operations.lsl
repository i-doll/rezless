checkTruth(string name, integer val)
{
    if (!val)
    {
        llOwnerSay("FAILED: " + name);
        // Force a crash.
        llOwnerSay((string)(0/0));
    }
}

default
{
    state_entry()
    {
        // Tests mirroring llList2List behavior - using same 10-element structure
        string LETTERS = "abcdefghij";

        // Basic tests (matching list_operations.lsl lines 70-72)
        checkTruth("one char", llGetSubString(LETTERS, 2, 2) == "c");
        checkTruth("multiple chars", llGetSubString(LETTERS, 2, 4) == "cde");
        checkTruth("empty string", llGetSubString("", 0, 0) == "");

        // Wraparound tests
        checkTruth("wraparound 1", llGetSubString(LETTERS, 8, 1) == "abij");
        checkTruth("wraparound 2", llGetSubString(LETTERS, 8, -9) == "abij");
        checkTruth("wraparound 3", llGetSubString(LETTERS, -2, -9) == "abij");
        checkTruth("wraparound 4", llGetSubString(LETTERS, -2, 1) == "abij");

        // Out of bounds tests
        checkTruth("extra negative 1", llGetSubString(LETTERS, -200, 1) == "ab");
        checkTruth("extra negative 2", llGetSubString(LETTERS, -200, -199) == "");
        checkTruth("huge indices", llGetSubString(LETTERS, 200, 201) == "");
        checkTruth("huge indices2", llGetSubString(LETTERS, 201, 200) == LETTERS);
        checkTruth("huge indices3", llGetSubString(LETTERS, 1, 200) == "bcdefghij");

        // Additional negative index tests
        checkTruth("negative both", llGetSubString(LETTERS, -5, -3) == "fgh");
        checkTruth("negative end", llGetSubString(LETTERS, 0, -1) == LETTERS);
        checkTruth("negative single", llGetSubString(LETTERS, -1, -1) == "j");

        // UTF-8 tests (if supported)
        // Note: These test that indices refer to codepoints, not bytes
        string UTF8_STR = "héllo";  // 'é' is 2 bytes in UTF-8
        checkTruth("utf8 basic", llGetSubString(UTF8_STR, 0, 1) == "hé");
        checkTruth("utf8 middle", llGetSubString(UTF8_STR, 1, 3) == "éll");
        checkTruth("utf8 single", llGetSubString(UTF8_STR, 1, 1) == "é");
        checkTruth("utf8 end", llGetSubString(UTF8_STR, 4, 4) == "o");

        // Mixed tests
        checkTruth("start equals end", llGetSubString(LETTERS, 5, 5) == "f");
        checkTruth("substring at start", llGetSubString(LETTERS, 0, 3) == "abcd");
        checkTruth("substring at end", llGetSubString(LETTERS, 7, 9) == "hij");
        checkTruth("substring middle", llGetSubString(LETTERS, 3, 6) == "defg");

        // Edge cases with single character strings
        string SINGLE = "x";
        checkTruth("single char string", llGetSubString(SINGLE, 0, 0) == "x");
        checkTruth("single char negative", llGetSubString(SINGLE, -1, -1) == "x");
        checkTruth("single char out of bounds", llGetSubString(SINGLE, 1, 1) == "");
        checkTruth("single char wraparound", llGetSubString(SINGLE, 1, 0) == "x");
    }
}
