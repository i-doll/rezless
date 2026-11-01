float LENGTH = 4.0;
float MAX_RANGE = 48.0;
integer MENU_CHANNEL = -482613;
key holder;
key endpoint;
vector destination;
integer targetHandle;
integer taut;
integer menuListener;
key menuUser;
integer choosingPost;
list posts;
list choices;

closeMenu()
{
    llListenRemove(menuListener);
    menuUser = NULL_KEY;
    choosingPost = FALSE;
    posts = [];
    choices = [];
}

slack()
{
    llTargetRemove(targetHandle);
    targetHandle = 0;
    llStopMoveToTarget();
    llParticleSystem([]);
    taut = FALSE;
}

releaseLeash()
{
    slack();
    endpoint = NULL_KEY;
    holder = NULL_KEY;
    llSetTimerEvent(0.0);
    closeMenu();
}

refresh()
{
    list details = llGetObjectDetails(endpoint, [OBJECT_POS]);
    if (llGetListLength(details) == 0)
    {
        slack();
        return;
    }
    vector position = llList2Vector(details, 0);
    if (llVecDist(llGetPos(), position) > MAX_RANGE)
    {
        slack();
        return;
    }
    if (!taut)
    {
        llParticleSystem([
            PSYS_PART_FLAGS, PSYS_PART_TARGET_POS_MASK | PSYS_PART_FOLLOW_SRC_MASK,
            PSYS_SRC_PATTERN, PSYS_SRC_PATTERN_DROP,
            PSYS_SRC_TARGET_KEY, endpoint,
            PSYS_PART_START_COLOR, <0.6, 0.6, 0.6>,
            PSYS_PART_START_SCALE, <0.04, 0.04, 0.0>,
            PSYS_PART_MAX_AGE, 1.0,
            PSYS_SRC_BURST_RATE, 0.04,
            PSYS_SRC_BURST_PART_COUNT, 1
        ]);
    }
    if (!taut || position != destination)
    {
        llTargetRemove(targetHandle);
        destination = position;
        targetHandle = llTarget(destination, LENGTH);
    }
    taut = TRUE;
}

default
{
    state_entry()
    {
        releaseLeash();
    }

    touch_start(integer count)
    {
        key toucher = llDetectedKey(0);
        if (holder != NULL_KEY && toucher != holder && toucher != llGetOwner()) return;
        closeMenu();
        menuUser = toucher;
        menuListener = llListen(MENU_CHANNEL, "", toucher, "");
        list buttons = ["Grab"];
        if (holder != NULL_KEY) buttons = ["Post", "Unleash"];
        llDialog(toucher, "Choose a leash action.", buttons, MENU_CHANNEL);
    }

    listen(integer channel, string name, key id, string message)
    {
        if (channel != MENU_CHANNEL || id != menuUser) return;
        if (choosingPost)
        {
            integer index = llListFindList(choices, [message]);
            if (index == -1) return;
            slack();
            endpoint = llList2Key(posts, index);
            closeMenu();
            refresh();
        }
        else if (message == "Grab" && holder == NULL_KEY)
        {
            if (id == llGetOwner())
            {
                llOwnerSay("The wearer cannot grab this leash.");
                closeMenu();
                return;
            }
            holder = id;
            endpoint = id;
            closeMenu();
            llSetTimerEvent(0.5);
            refresh();
        }
        else if (message == "Post" && holder != NULL_KEY)
        {
            llSensor("", NULL_KEY, ACTIVE | PASSIVE, 12.0, PI);
        }
        else if (message == "Unleash") releaseLeash();
    }

    sensor(integer count)
    {
        if (menuUser == NULL_KEY) return;
        integer i;
        posts = [];
        choices = [];
        string description = "Pick a nearby post:\n";
        for (i = 0; i < count && i < 9; ++i)
        {
            string number = (string)(i + 1);
            posts += [llDetectedKey(i)];
            choices += [number];
            description += number + ": " + llDetectedName(i) + "\n";
        }
        choosingPost = TRUE;
        llDialog(menuUser, description, choices, MENU_CHANNEL);
    }

    no_sensor()
    {
        llOwnerSay("No nearby objects to use as a post.");
        closeMenu();
    }

    timer()
    {
        if (endpoint != NULL_KEY) refresh();
    }

    not_at_target()
    {
        if (taut) llMoveToTarget(destination, 0.75);
    }

    at_target(integer handle, vector targetPosition, vector ourPosition)
    {
        if (taut && handle == targetHandle) llStopMoveToTarget();
    }
}
