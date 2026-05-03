// packages/vitest/src/matchers.ts
import { expect } from "vitest";
function isScript(value) {
  return typeof value === "object" && value !== null && "chat" in value && "currentState" in value && "callsOf" in value;
}
expect.extend({
  toHaveSaid(received, channel, text) {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`
      };
    }
    const matched = received.chat.some((c) => c.channel === channel && c.text === text);
    return {
      pass: matched,
      message: () => matched ? `expected script not to have said ${JSON.stringify(text)} on channel ${channel}` : `expected script to have said ${JSON.stringify(text)} on channel ${channel}
  actual chat: ${JSON.stringify(received.chat, null, 2)}`,
      actual: received.chat,
      expected: { channel, text }
    };
  },
  toBeInState(received, name) {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`
      };
    }
    const pass = received.currentState === name;
    return {
      pass,
      message: () => pass ? `expected script not to be in state '${name}'` : `expected script to be in state '${name}', actual: '${received.currentState}'`,
      actual: received.currentState,
      expected: name
    };
  },
  toHaveCalledFunction(received, name, ...args) {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`
      };
    }
    const calls = received.callsOf(name);
    if (calls.length === 0) {
      return {
        pass: false,
        message: () => `expected script to have called ${name}, but it was never called`
      };
    }
    if (args.length === 0) {
      return {
        pass: true,
        message: () => `expected script not to have called ${name}`
      };
    }
    const matched = calls.some(
      (c) => c.args.length === args.length && c.args.every((a, i) => Object.is(a, args[i]) || JSON.stringify(a) === JSON.stringify(args[i]))
    );
    return {
      pass: matched,
      message: () => matched ? `expected script not to have called ${name}(${args.map((a) => JSON.stringify(a)).join(", ")})` : `expected script to have called ${name}(${args.map((a) => JSON.stringify(a)).join(", ")})
  actual calls: ${JSON.stringify(calls, null, 2)}`,
      actual: calls,
      expected: { name, args }
    };
  },
  toHaveSentHTTP(received, expected) {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`
      };
    }
    const reqs = received.httpRequests;
    const matched = reqs.some(
      (r) => (expected.url === void 0 || r.url === expected.url) && (expected.method === void 0 || r.method === expected.method) && (expected.body === void 0 || r.body === expected.body)
    );
    return {
      pass: matched,
      message: () => matched ? `expected script not to have sent HTTP ${JSON.stringify(expected)}` : `expected script to have sent HTTP ${JSON.stringify(expected)}
  actual requests: ${JSON.stringify(reqs, null, 2)}`,
      actual: reqs,
      expected
    };
  },
  toHaveListened(received, channel, filter) {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`
      };
    }
    const NULL_KEY2 = "00000000-0000-0000-0000-000000000000";
    const matched = received.listens.some(
      (l) => l.active && l.channel === channel && (filter?.name === void 0 || l.name === filter.name) && (filter?.key === void 0 || l.key === filter.key || filter.key === "" && (l.key === "" || l.key === NULL_KEY2)) && (filter?.message === void 0 || l.message === filter.message)
    );
    return {
      pass: matched,
      message: () => matched ? `expected script not to have listened on channel ${channel}` : `expected script to have listened on channel ${channel}${filter ? ` with filter ${JSON.stringify(filter)}` : ""}
  actual listens: ${JSON.stringify(received.listens, null, 2)}`,
      actual: received.listens,
      expected: { channel, filter }
    };
  }
});

// packages/vm/dist/generated/constants.js
var ATTACH_LPEC = 30;
var ATTACH_RPEC = 29;
var DATA_RATING = 4;
var LAND_LARGE_BRUSH = 3;
var LAND_MEDIUM_BRUSH = 2;
var LAND_SMALL_BRUSH = 1;
var PRIM_MATERIAL_LIGHT = 7;
var PSYS_SRC_INNERANGLE = 10;
var PSYS_SRC_OUTERANGLE = 11;
var REMOTE_DATA_CHANNEL = 1;
var REMOTE_DATA_REPLY = 3;
var REMOTE_DATA_REQUEST = 2;
var SKY_TRACKS = 15;
var VEHICLE_FLAG_NO_FLY_UP = 1;
var ACTIVE = 2;
var AGENT = 1;
var AGENT_ALWAYS_RUN = 4096;
var AGENT_ATTACHMENTS = 2;
var AGENT_AUTOMATED = 16384;
var AGENT_AUTOPILOT = 8192;
var AGENT_AWAY = 64;
var AGENT_BUSY = 2048;
var AGENT_BY_LEGACY_NAME = 1;
var AGENT_BY_USERNAME = 16;
var AGENT_CROUCHING = 1024;
var AGENT_FLOATING_VIA_SCRIPTED_ATTACHMENT = 32768;
var AGENT_FLYING = 1;
var AGENT_IN_AIR = 256;
var AGENT_LIST_PARCEL = 1;
var AGENT_LIST_PARCEL_OWNER = 2;
var AGENT_LIST_REGION = 4;
var AGENT_MOUSELOOK = 8;
var AGENT_ON_OBJECT = 32;
var AGENT_SCRIPTED = 4;
var AGENT_SITTING = 16;
var AGENT_TYPING = 512;
var AGENT_WALKING = 128;
var ALL_SIDES = -1;
var ANIM_ON = 1;
var ATTACH_ANY_HUD = -1;
var ATTACH_AVATAR_CENTER = 40;
var ATTACH_BACK = 9;
var ATTACH_BELLY = 28;
var ATTACH_CHEST = 1;
var ATTACH_CHIN = 12;
var ATTACH_FACE_JAW = 47;
var ATTACH_FACE_LEAR = 48;
var ATTACH_FACE_LEYE = 50;
var ATTACH_FACE_REAR = 49;
var ATTACH_FACE_REYE = 51;
var ATTACH_FACE_TONGUE = 52;
var ATTACH_GROIN = 53;
var ATTACH_HEAD = 2;
var ATTACH_HIND_LFOOT = 54;
var ATTACH_HIND_RFOOT = 55;
var ATTACH_HUD_BOTTOM = 37;
var ATTACH_HUD_BOTTOM_LEFT = 36;
var ATTACH_HUD_BOTTOM_RIGHT = 38;
var ATTACH_HUD_CENTER_1 = 35;
var ATTACH_HUD_CENTER_2 = 31;
var ATTACH_HUD_TOP_CENTER = 33;
var ATTACH_HUD_TOP_LEFT = 34;
var ATTACH_HUD_TOP_RIGHT = 32;
var ATTACH_LEAR = 13;
var ATTACH_LEFT_PEC = 29;
var ATTACH_LEYE = 15;
var ATTACH_LFOOT = 7;
var ATTACH_LHAND = 5;
var ATTACH_LHAND_RING1 = 41;
var ATTACH_LHIP = 25;
var ATTACH_LLARM = 21;
var ATTACH_LLLEG = 27;
var ATTACH_LSHOULDER = 3;
var ATTACH_LUARM = 20;
var ATTACH_LULEG = 26;
var ATTACH_LWING = 45;
var ATTACH_MOUTH = 11;
var ATTACH_NECK = 39;
var ATTACH_NOSE = 17;
var ATTACH_PELVIS = 10;
var ATTACH_REAR = 14;
var ATTACH_REYE = 16;
var ATTACH_RFOOT = 8;
var ATTACH_RHAND = 6;
var ATTACH_RHAND_RING1 = 42;
var ATTACH_RHIP = 22;
var ATTACH_RIGHT_PEC = 30;
var ATTACH_RLARM = 19;
var ATTACH_RLLEG = 24;
var ATTACH_RSHOULDER = 4;
var ATTACH_RUARM = 18;
var ATTACH_RULEG = 23;
var ATTACH_RWING = 46;
var ATTACH_TAIL_BASE = 43;
var ATTACH_TAIL_TIP = 44;
var AVOID_CHARACTERS = 1;
var AVOID_DYNAMIC_OBSTACLES = 2;
var AVOID_NONE = 0;
var BEACON_MAP = 1;
var CAMERA_ACTIVE = 12;
var CAMERA_BEHINDNESS_ANGLE = 8;
var CAMERA_BEHINDNESS_LAG = 9;
var CAMERA_DISTANCE = 7;
var CAMERA_FOCUS = 17;
var CAMERA_FOCUS_LAG = 6;
var CAMERA_FOCUS_LOCKED = 22;
var CAMERA_FOCUS_OFFSET = 1;
var CAMERA_FOCUS_THRESHOLD = 11;
var CAMERA_PITCH = 0;
var CAMERA_POSITION = 13;
var CAMERA_POSITION_LAG = 5;
var CAMERA_POSITION_LOCKED = 21;
var CAMERA_POSITION_THRESHOLD = 10;
var CHANGED_ALLOWED_DROP = 64;
var CHANGED_COLOR = 2;
var CHANGED_INVENTORY = 1;
var CHANGED_LINK = 32;
var CHANGED_MEDIA = 2048;
var CHANGED_OWNER = 128;
var CHANGED_REGION = 256;
var CHANGED_REGION_START = 1024;
var CHANGED_RENDER_MATERIAL = 4096;
var CHANGED_SCALE = 8;
var CHANGED_SHAPE = 4;
var CHANGED_TELEPORT = 512;
var CHANGED_TEXTURE = 16;
var CHARACTER_ACCOUNT_FOR_SKIPPED_FRAMES = 14;
var CHARACTER_AVOIDANCE_MODE = 5;
var CHARACTER_CMD_JUMP = 1;
var CHARACTER_CMD_SMOOTH_STOP = 2;
var CHARACTER_CMD_STOP = 0;
var CHARACTER_DESIRED_SPEED = 1;
var CHARACTER_DESIRED_TURN_SPEED = 12;
var CHARACTER_LENGTH = 3;
var CHARACTER_MAX_ACCEL = 8;
var CHARACTER_MAX_DECEL = 9;
var CHARACTER_MAX_SPEED = 13;
var CHARACTER_MAX_TURN_RADIUS = 10;
var CHARACTER_ORIENTATION = 4;
var CHARACTER_RADIUS = 2;
var CHARACTER_STAY_WITHIN_PARCEL = 15;
var CHARACTER_TYPE = 6;
var CHARACTER_TYPE_A = 0;
var CHARACTER_TYPE_B = 1;
var CHARACTER_TYPE_C = 2;
var CHARACTER_TYPE_D = 3;
var CHARACTER_TYPE_NONE = 4;
var CLICK_ACTION_BUY = 2;
var CLICK_ACTION_DISABLED = 8;
var CLICK_ACTION_IGNORE = 9;
var CLICK_ACTION_NONE = 0;
var CLICK_ACTION_OPEN = 4;
var CLICK_ACTION_OPEN_MEDIA = 6;
var CLICK_ACTION_PAY = 3;
var CLICK_ACTION_PLAY = 5;
var CLICK_ACTION_SIT = 1;
var CLICK_ACTION_TOUCH = 0;
var CLICK_ACTION_ZOOM = 7;
var COMBAT_CHANNEL = 2147483646;
var COMBAT_LOG_ID = "45e0fcfa-2268-4490-a51c-3e51bdfe80d1";
var CONTENT_TYPE_ATOM = 4;
var CONTENT_TYPE_FORM = 7;
var CONTENT_TYPE_HTML = 1;
var CONTENT_TYPE_JSON = 5;
var CONTENT_TYPE_LLSD = 6;
var CONTENT_TYPE_RSS = 8;
var CONTENT_TYPE_TEXT = 0;
var CONTENT_TYPE_XHTML = 3;
var CONTENT_TYPE_XML = 2;
var CONTROL_BACK = 2;
var CONTROL_DOWN = 32;
var CONTROL_FWD = 1;
var CONTROL_LBUTTON = 268435456;
var CONTROL_LEFT = 4;
var CONTROL_ML_LBUTTON = 1073741824;
var CONTROL_RIGHT = 8;
var CONTROL_ROT_LEFT = 256;
var CONTROL_ROT_RIGHT = 512;
var CONTROL_UP = 16;
var DAMAGEABLE = 32;
var DAMAGE_TYPE_ACID = 1;
var DAMAGE_TYPE_BLUDGEONING = 2;
var DAMAGE_TYPE_COLD = 3;
var DAMAGE_TYPE_ELECTRIC = 4;
var DAMAGE_TYPE_EMOTIONAL = 14;
var DAMAGE_TYPE_FIRE = 5;
var DAMAGE_TYPE_FORCE = 6;
var DAMAGE_TYPE_GENERIC = 0;
var DAMAGE_TYPE_IMPACT = -1;
var DAMAGE_TYPE_NECROTIC = 7;
var DAMAGE_TYPE_PIERCING = 8;
var DAMAGE_TYPE_POISON = 9;
var DAMAGE_TYPE_PSYCHIC = 10;
var DAMAGE_TYPE_RADIANT = 11;
var DAMAGE_TYPE_SLASHING = 12;
var DAMAGE_TYPE_SONIC = 13;
var DATA_BORN = 3;
var DATA_NAME = 2;
var DATA_ONLINE = 1;
var DATA_PAYINFO = 8;
var DATA_SIM_POS = 5;
var DATA_SIM_RATING = 7;
var DATA_SIM_STATUS = 6;
var DEBUG_CHANNEL = 2147483647;
var DEG_TO_RAD = 0.017453293;
var DENSITY = 1;
var DEREZ_DIE = 0;
var DEREZ_MAKE_TEMP = 1;
var ENVIRONMENT_DAYINFO = 200;
var ENV_INVALID_AGENT = -4;
var ENV_INVALID_RULE = -5;
var ENV_NOT_EXPERIENCE = -1;
var ENV_NO_ENVIRONMENT = -3;
var ENV_NO_EXPERIENCE_LAND = -7;
var ENV_NO_EXPERIENCE_PERMISSION = -2;
var ENV_NO_PERMISSIONS = -9;
var ENV_THROTTLE = -8;
var ENV_VALIDATION_FAIL = -6;
var EOF = "\n\n\n";
var ERR_GENERIC = -1;
var ERR_MALFORMED_PARAMS = -3;
var ERR_PARCEL_PERMISSIONS = -2;
var ERR_RUNTIME_PERMISSIONS = -4;
var ERR_THROTTLED = -5;
var ESTATE_ACCESS_ALLOWED_AGENT_ADD = 4;
var ESTATE_ACCESS_ALLOWED_AGENT_REMOVE = 8;
var ESTATE_ACCESS_ALLOWED_GROUP_ADD = 16;
var ESTATE_ACCESS_ALLOWED_GROUP_REMOVE = 32;
var ESTATE_ACCESS_BANNED_AGENT_ADD = 64;
var ESTATE_ACCESS_BANNED_AGENT_REMOVE = 128;
var FALSE = 0;
var FILTER_FLAGS = 2;
var FILTER_FLAG_HUDS = 1;
var FILTER_INCLUDE = 1;
var FORCE_DIRECT_PATH = 1;
var FRICTION = 2;
var GAME_CONTROL_AXIS_LEFTX = 0;
var GAME_CONTROL_AXIS_LEFTY = 1;
var GAME_CONTROL_AXIS_RIGHTX = 2;
var GAME_CONTROL_AXIS_RIGHTY = 3;
var GAME_CONTROL_AXIS_TRIGGERLEFT = 4;
var GAME_CONTROL_AXIS_TRIGGERRIGHT = 5;
var GAME_CONTROL_BUTTON_A = 1;
var GAME_CONTROL_BUTTON_B = 2;
var GAME_CONTROL_BUTTON_BACK = 16;
var GAME_CONTROL_BUTTON_DPAD_DOWN = 4096;
var GAME_CONTROL_BUTTON_DPAD_LEFT = 8192;
var GAME_CONTROL_BUTTON_DPAD_RIGHT = 16384;
var GAME_CONTROL_BUTTON_DPAD_UP = 2048;
var GAME_CONTROL_BUTTON_GUIDE = 32;
var GAME_CONTROL_BUTTON_LEFTSHOULDER = 512;
var GAME_CONTROL_BUTTON_LEFTSTICK = 128;
var GAME_CONTROL_BUTTON_MISC1 = 32768;
var GAME_CONTROL_BUTTON_PADDLE1 = 65536;
var GAME_CONTROL_BUTTON_PADDLE2 = 131072;
var GAME_CONTROL_BUTTON_PADDLE3 = 262144;
var GAME_CONTROL_BUTTON_PADDLE4 = 524288;
var GAME_CONTROL_BUTTON_RIGHTSHOULDER = 1024;
var GAME_CONTROL_BUTTON_RIGHTSTICK = 256;
var GAME_CONTROL_BUTTON_START = 64;
var GAME_CONTROL_BUTTON_TOUCHPAD = 1048576;
var GAME_CONTROL_BUTTON_X = 4;
var GAME_CONTROL_BUTTON_Y = 8;
var GCNP_RADIUS = 0;
var GCNP_STATIC = 1;
var GRAVITY_MULTIPLIER = 8;
var HORIZONTAL = 1;
var HTTP_ACCEPT = 8;
var HTTP_BODY_MAXLENGTH = 2;
var HTTP_BODY_TRUNCATED = 0;
var HTTP_CUSTOM_HEADER = 5;
var HTTP_EXTENDED_ERROR = 9;
var HTTP_METHOD = 0;
var HTTP_MIMETYPE = 1;
var HTTP_PRAGMA_NO_CACHE = 6;
var HTTP_USER_AGENT = 7;
var HTTP_VERBOSE_THROTTLE = 4;
var HTTP_VERIFY_CERT = 3;
var IMG_USE_BAKED_AUX1 = "9742065b-19b5-297c-858a-29711d539043";
var IMG_USE_BAKED_AUX2 = "03642e83-2bd1-4eb9-34b4-4c47ed586d2d";
var IMG_USE_BAKED_AUX3 = "edd51b77-fc10-ce7a-4b3d-011dfc349e4f";
var IMG_USE_BAKED_EYES = "52cc6bb6-2ee5-e632-d3ad-50197b1dcb8a";
var IMG_USE_BAKED_HAIR = "09aac1fb-6bce-0bee-7d44-caac6dbb6c63";
var IMG_USE_BAKED_HEAD = "5a9f4a74-30f2-821c-b88d-70499d3e7183";
var IMG_USE_BAKED_LEFTARM = "ff62763f-d60a-9855-890b-0c96f8f8cd98";
var IMG_USE_BAKED_LEFTLEG = "8e915e25-31d1-cc95-ae08-d58a47488251";
var IMG_USE_BAKED_LOWER = "24daea5f-0539-cfcf-047f-fbc40b2786ba";
var IMG_USE_BAKED_SKIRT = "43529ce8-7faa-ad92-165a-bc4078371687";
var IMG_USE_BAKED_UPPER = "ae2de45c-d252-50b8-5c6e-19f39ce79317";
var INVENTORY_ALL = -1;
var INVENTORY_ANIMATION = 20;
var INVENTORY_BODYPART = 13;
var INVENTORY_CLOTHING = 5;
var INVENTORY_GESTURE = 21;
var INVENTORY_LANDMARK = 3;
var INVENTORY_MATERIAL = 57;
var INVENTORY_NONE = -1;
var INVENTORY_NOTECARD = 7;
var INVENTORY_OBJECT = 6;
var INVENTORY_SCRIPT = 10;
var INVENTORY_SETTING = 56;
var INVENTORY_SOUND = 1;
var INVENTORY_TEXTURE = 0;
var JSON_APPEND = -1;
var JSON_ARRAY = "\uFDD2";
var JSON_DELETE = "\uFDD8";
var JSON_FALSE = "\uFDD7";
var JSON_INVALID = "\uFDD0";
var JSON_NULL = "\uFDD5";
var JSON_NUMBER = "\uFDD3";
var JSON_OBJECT = "\uFDD1";
var JSON_STRING = "\uFDD4";
var JSON_TRUE = "\uFDD6";
var KFM_CMD_PAUSE = 2;
var KFM_CMD_PLAY = 0;
var KFM_CMD_STOP = 1;
var KFM_COMMAND = 0;
var KFM_DATA = 2;
var KFM_FORWARD = 0;
var KFM_LOOP = 1;
var KFM_MODE = 1;
var KFM_PING_PONG = 2;
var KFM_REVERSE = 3;
var KFM_ROTATION = 1;
var KFM_TRANSLATION = 2;
var LAND_LEVEL = 0;
var LAND_LOWER = 2;
var LAND_NOISE = 4;
var LAND_RAISE = 1;
var LAND_REVERT = 5;
var LAND_SMOOTH = 3;
var LINKSETDATA_DELETE = 2;
var LINKSETDATA_EMEMORY = 1;
var LINKSETDATA_ENOKEY = 2;
var LINKSETDATA_EPROTECTED = 3;
var LINKSETDATA_MULTIDELETE = 3;
var LINKSETDATA_NOTFOUND = 4;
var LINKSETDATA_NOUPDATE = 5;
var LINKSETDATA_OK = 0;
var LINKSETDATA_RESET = 0;
var LINKSETDATA_UPDATE = 1;
var LINK_ALL_CHILDREN = -3;
var LINK_ALL_OTHERS = -2;
var LINK_ROOT = 1;
var LINK_SET = -1;
var LINK_THIS = -4;
var LIST_STAT_GEOMETRIC_MEAN = 9;
var LIST_STAT_MAX = 2;
var LIST_STAT_MEAN = 3;
var LIST_STAT_MEDIAN = 4;
var LIST_STAT_MIN = 1;
var LIST_STAT_NUM_COUNT = 8;
var LIST_STAT_RANGE = 0;
var LIST_STAT_STD_DEV = 5;
var LIST_STAT_SUM = 6;
var LIST_STAT_SUM_SQUARES = 7;
var LOOP = 2;
var MASK_BASE = 0;
var MASK_EVERYONE = 3;
var MASK_GROUP = 2;
var MASK_NEXT = 4;
var MASK_OWNER = 1;
var NAK = "\n\n";
var OBJECT_ACCOUNT_LEVEL = 41;
var OBJECT_ANIMATED_COUNT = 39;
var OBJECT_ANIMATED_SLOTS_AVAILABLE = 40;
var OBJECT_ATTACHED_POINT = 19;
var OBJECT_ATTACHED_SLOTS_AVAILABLE = 35;
var OBJECT_BODY_SHAPE_TYPE = 26;
var OBJECT_CHARACTER_TIME = 17;
var OBJECT_CLICK_ACTION = 28;
var OBJECT_CREATION_TIME = 36;
var OBJECT_CREATOR = 8;
var OBJECT_DAMAGE = 51;
var OBJECT_DAMAGE_TYPE = 52;
var OBJECT_DESC = 2;
var OBJECT_GROUP = 7;
var OBJECT_GROUP_TAG = 33;
var OBJECT_HEALTH = 50;
var OBJECT_HOVER_HEIGHT = 25;
var OBJECT_LAST_OWNER_ID = 27;
var OBJECT_LINK_NUMBER = 46;
var OBJECT_MASS = 43;
var OBJECT_MATERIAL = 42;
var OBJECT_NAME = 1;
var OBJECT_OMEGA = 29;
var OBJECT_OWNER = 6;
var OBJECT_PATHFINDING_TYPE = 20;
var OBJECT_PHANTOM = 22;
var OBJECT_PHYSICS = 21;
var OBJECT_PHYSICS_COST = 16;
var OBJECT_POS = 3;
var OBJECT_PRIM_COUNT = 30;
var OBJECT_PRIM_EQUIVALENCE = 13;
var OBJECT_RENDER_WEIGHT = 24;
var OBJECT_RETURN_PARCEL = 1;
var OBJECT_RETURN_PARCEL_OWNER = 2;
var OBJECT_RETURN_REGION = 4;
var OBJECT_REZZER_KEY = 32;
var OBJECT_REZ_TIME = 45;
var OBJECT_ROOT = 18;
var OBJECT_ROT = 4;
var OBJECT_RUNNING_SCRIPT_COUNT = 9;
var OBJECT_SCALE = 47;
var OBJECT_SCRIPT_MEMORY = 11;
var OBJECT_SCRIPT_TIME = 12;
var OBJECT_SELECT_COUNT = 37;
var OBJECT_SERVER_COST = 14;
var OBJECT_SIT_COUNT = 38;
var OBJECT_STREAMING_COST = 15;
var OBJECT_TEMP_ATTACHED = 34;
var OBJECT_TEMP_ON_REZ = 23;
var OBJECT_TEXT = 44;
var OBJECT_TEXT_ALPHA = 49;
var OBJECT_TEXT_COLOR = 48;
var OBJECT_TOTAL_INVENTORY_COUNT = 31;
var OBJECT_TOTAL_SCRIPT_COUNT = 10;
var OBJECT_UNKNOWN_DETAIL = -1;
var OBJECT_VELOCITY = 5;
var OPT_AVATAR = 1;
var OPT_CHARACTER = 2;
var OPT_EXCLUSION_VOLUME = 6;
var OPT_LEGACY_LINKSET = 0;
var OPT_MATERIAL_VOLUME = 5;
var OPT_OTHER = -1;
var OPT_STATIC_OBSTACLE = 4;
var OPT_WALKABLE = 3;
var PARCEL_COUNT_GROUP = 2;
var PARCEL_COUNT_OTHER = 3;
var PARCEL_COUNT_OWNER = 1;
var PARCEL_COUNT_SELECTED = 4;
var PARCEL_COUNT_TEMP = 5;
var PARCEL_COUNT_TOTAL = 0;
var PARCEL_DETAILS_AREA = 4;
var PARCEL_DETAILS_DESC = 1;
var PARCEL_DETAILS_FLAGS = 12;
var PARCEL_DETAILS_GROUP = 3;
var PARCEL_DETAILS_ID = 5;
var PARCEL_DETAILS_LANDING_LOOKAT = 10;
var PARCEL_DETAILS_LANDING_POINT = 9;
var PARCEL_DETAILS_NAME = 0;
var PARCEL_DETAILS_OWNER = 2;
var PARCEL_DETAILS_PRIM_CAPACITY = 7;
var PARCEL_DETAILS_PRIM_USED = 8;
var PARCEL_DETAILS_SCRIPT_DANGER = 13;
var PARCEL_DETAILS_SEE_AVATARS = 6;
var PARCEL_DETAILS_TP_ROUTING = 11;
var PARCEL_FLAG_ALLOW_ALL_OBJECT_ENTRY = 134217728;
var PARCEL_FLAG_ALLOW_CREATE_GROUP_OBJECTS = 67108864;
var PARCEL_FLAG_ALLOW_CREATE_OBJECTS = 64;
var PARCEL_FLAG_ALLOW_DAMAGE = 32;
var PARCEL_FLAG_ALLOW_FLY = 1;
var PARCEL_FLAG_ALLOW_GROUP_OBJECT_ENTRY = 268435456;
var PARCEL_FLAG_ALLOW_GROUP_SCRIPTS = 33554432;
var PARCEL_FLAG_ALLOW_LANDMARK = 8;
var PARCEL_FLAG_ALLOW_SCRIPTS = 2;
var PARCEL_FLAG_ALLOW_TERRAFORM = 16;
var PARCEL_FLAG_LOCAL_SOUND_ONLY = 32768;
var PARCEL_FLAG_RESTRICT_PUSHOBJECT = 2097152;
var PARCEL_FLAG_USE_ACCESS_GROUP = 256;
var PARCEL_FLAG_USE_ACCESS_LIST = 512;
var PARCEL_FLAG_USE_BAN_LIST = 1024;
var PARCEL_FLAG_USE_LAND_PASS_LIST = 2048;
var PARCEL_MEDIA_COMMAND_AGENT = 7;
var PARCEL_MEDIA_COMMAND_AUTO_ALIGN = 9;
var PARCEL_MEDIA_COMMAND_DESC = 12;
var PARCEL_MEDIA_COMMAND_LOOP = 3;
var PARCEL_MEDIA_COMMAND_LOOP_SET = 13;
var PARCEL_MEDIA_COMMAND_PAUSE = 1;
var PARCEL_MEDIA_COMMAND_PLAY = 2;
var PARCEL_MEDIA_COMMAND_SIZE = 11;
var PARCEL_MEDIA_COMMAND_STOP = 0;
var PARCEL_MEDIA_COMMAND_TEXTURE = 4;
var PARCEL_MEDIA_COMMAND_TIME = 6;
var PARCEL_MEDIA_COMMAND_TYPE = 10;
var PARCEL_MEDIA_COMMAND_UNLOAD = 8;
var PARCEL_MEDIA_COMMAND_URL = 5;
var PASSIVE = 4;
var PASS_ALWAYS = 1;
var PASS_IF_NOT_HANDLED = 0;
var PASS_NEVER = 2;
var PATROL_PAUSE_AT_WAYPOINTS = 0;
var PAYMENT_INFO_ON_FILE = 1;
var PAYMENT_INFO_USED = 2;
var PAY_DEFAULT = -2;
var PAY_HIDE = -1;
var PERMISSION_ATTACH = 32;
var PERMISSION_CHANGE_JOINTS = 256;
var PERMISSION_CHANGE_LINKS = 128;
var PERMISSION_CHANGE_PERMISSIONS = 512;
var PERMISSION_CONTROL_CAMERA = 2048;
var PERMISSION_DEBIT = 2;
var PERMISSION_OVERRIDE_ANIMATIONS = 32768;
var PERMISSION_RELEASE_OWNERSHIP = 64;
var PERMISSION_REMAP_CONTROLS = 8;
var PERMISSION_RETURN_OBJECTS = 65536;
var PERMISSION_SILENT_ESTATE_MANAGEMENT = 16384;
var PERMISSION_TAKE_CONTROLS = 4;
var PERMISSION_TELEPORT = 4096;
var PERMISSION_TRACK_CAMERA = 1024;
var PERMISSION_TRIGGER_ANIMATION = 16;
var PERM_ALL = 2147483647;
var PERM_COPY = 32768;
var PERM_MODIFY = 16384;
var PERM_MOVE = 524288;
var PERM_TRANSFER = 8192;
var PI = 3.14159265;
var PING_PONG = 8;
var PI_BY_TWO = 1.57079633;
var PRIM_ALLOW_UNSIT = 39;
var PRIM_ALPHA_MODE = 38;
var PRIM_ALPHA_MODE_BLEND = 1;
var PRIM_ALPHA_MODE_EMISSIVE = 3;
var PRIM_ALPHA_MODE_MASK = 2;
var PRIM_ALPHA_MODE_NONE = 0;
var PRIM_BUMP_BARK = 4;
var PRIM_BUMP_BLOBS = 12;
var PRIM_BUMP_BRICKS = 5;
var PRIM_BUMP_BRIGHT = 1;
var PRIM_BUMP_CHECKER = 6;
var PRIM_BUMP_CONCRETE = 7;
var PRIM_BUMP_DARK = 2;
var PRIM_BUMP_DISKS = 10;
var PRIM_BUMP_GRAVEL = 11;
var PRIM_BUMP_LARGETILE = 14;
var PRIM_BUMP_NONE = 0;
var PRIM_BUMP_SHINY = 19;
var PRIM_BUMP_SIDING = 13;
var PRIM_BUMP_STONE = 9;
var PRIM_BUMP_STUCCO = 15;
var PRIM_BUMP_SUCTION = 16;
var PRIM_BUMP_TILE = 8;
var PRIM_BUMP_WEAVE = 17;
var PRIM_BUMP_WOOD = 3;
var PRIM_CAST_SHADOWS = 24;
var PRIM_CLICK_ACTION = 43;
var PRIM_COLOR = 18;
var PRIM_DAMAGE = 51;
var PRIM_DESC = 28;
var PRIM_FLEXIBLE = 21;
var PRIM_FULLBRIGHT = 20;
var PRIM_GLOW = 25;
var PRIM_GLTF_ALPHA_MODE_BLEND = 1;
var PRIM_GLTF_ALPHA_MODE_MASK = 2;
var PRIM_GLTF_ALPHA_MODE_OPAQUE = 0;
var PRIM_GLTF_BASE_COLOR = 48;
var PRIM_GLTF_EMISSIVE = 46;
var PRIM_GLTF_METALLIC_ROUGHNESS = 47;
var PRIM_GLTF_NORMAL = 45;
var PRIM_HEALTH = 52;
var PRIM_HOLE_CIRCLE = 16;
var PRIM_HOLE_DEFAULT = 0;
var PRIM_HOLE_SQUARE = 32;
var PRIM_HOLE_TRIANGLE = 48;
var PRIM_LINK_TARGET = 34;
var PRIM_MATERIAL = 2;
var PRIM_MATERIAL_FLESH = 4;
var PRIM_MATERIAL_GLASS = 2;
var PRIM_MATERIAL_METAL = 1;
var PRIM_MATERIAL_PLASTIC = 5;
var PRIM_MATERIAL_RUBBER = 6;
var PRIM_MATERIAL_STONE = 0;
var PRIM_MATERIAL_WOOD = 3;
var PRIM_MEDIA_ALT_IMAGE_ENABLE = 0;
var PRIM_MEDIA_AUTO_LOOP = 4;
var PRIM_MEDIA_AUTO_PLAY = 5;
var PRIM_MEDIA_AUTO_SCALE = 6;
var PRIM_MEDIA_AUTO_ZOOM = 7;
var PRIM_MEDIA_CONTROLS = 1;
var PRIM_MEDIA_CONTROLS_MINI = 1;
var PRIM_MEDIA_CONTROLS_STANDARD = 0;
var PRIM_MEDIA_CURRENT_URL = 2;
var PRIM_MEDIA_FIRST_CLICK_INTERACT = 8;
var PRIM_MEDIA_HEIGHT_PIXELS = 10;
var PRIM_MEDIA_HOME_URL = 3;
var PRIM_MEDIA_MAX_HEIGHT_PIXELS = 2048;
var PRIM_MEDIA_MAX_URL_LENGTH = 1024;
var PRIM_MEDIA_MAX_WHITELIST_COUNT = 64;
var PRIM_MEDIA_MAX_WHITELIST_SIZE = 1024;
var PRIM_MEDIA_MAX_WIDTH_PIXELS = 2048;
var PRIM_MEDIA_PARAM_MAX = 14;
var PRIM_MEDIA_PERMS_CONTROL = 14;
var PRIM_MEDIA_PERMS_INTERACT = 13;
var PRIM_MEDIA_PERM_ANYONE = 4;
var PRIM_MEDIA_PERM_GROUP = 2;
var PRIM_MEDIA_PERM_NONE = 0;
var PRIM_MEDIA_PERM_OWNER = 1;
var PRIM_MEDIA_WHITELIST = 12;
var PRIM_MEDIA_WHITELIST_ENABLE = 11;
var PRIM_MEDIA_WIDTH_PIXELS = 9;
var PRIM_NAME = 27;
var PRIM_NORMAL = 37;
var PRIM_OMEGA = 32;
var PRIM_PHANTOM = 5;
var PRIM_PHYSICS = 3;
var PRIM_PHYSICS_SHAPE_CONVEX = 2;
var PRIM_PHYSICS_SHAPE_NONE = 1;
var PRIM_PHYSICS_SHAPE_PRIM = 0;
var PRIM_PHYSICS_SHAPE_TYPE = 30;
var PRIM_POINT_LIGHT = 23;
var PRIM_POSITION = 6;
var PRIM_POS_LOCAL = 33;
var PRIM_PROJECTOR = 42;
var PRIM_REFLECTION_PROBE = 44;
var PRIM_REFLECTION_PROBE_BOX = 1;
var PRIM_REFLECTION_PROBE_DYNAMIC = 2;
var PRIM_REFLECTION_PROBE_MIRROR = 4;
var PRIM_RENDER_MATERIAL = 49;
var PRIM_ROTATION = 8;
var PRIM_ROT_LOCAL = 29;
var PRIM_SCRIPTED_SIT_ONLY = 40;
var PRIM_SCULPT_FLAG_ANIMESH = 32;
var PRIM_SCULPT_FLAG_INVERT = 64;
var PRIM_SCULPT_FLAG_MIRROR = 128;
var PRIM_SCULPT_TYPE_CYLINDER = 4;
var PRIM_SCULPT_TYPE_MASK = 7;
var PRIM_SCULPT_TYPE_MESH = 5;
var PRIM_SCULPT_TYPE_PLANE = 3;
var PRIM_SCULPT_TYPE_SPHERE = 1;
var PRIM_SCULPT_TYPE_TORUS = 2;
var PRIM_SHINY_HIGH = 3;
var PRIM_SHINY_LOW = 1;
var PRIM_SHINY_MEDIUM = 2;
var PRIM_SHINY_NONE = 0;
var PRIM_SIT_FLAGS = 50;
var PRIM_SIT_TARGET = 41;
var PRIM_SIZE = 7;
var PRIM_SLICE = 35;
var PRIM_SPECULAR = 36;
var PRIM_TEMP_ON_REZ = 4;
var PRIM_TEXGEN = 22;
var PRIM_TEXGEN_DEFAULT = 0;
var PRIM_TEXGEN_PLANAR = 1;
var PRIM_TEXT = 26;
var PRIM_TEXTURE = 17;
var PRIM_TYPE = 9;
var PRIM_TYPE_BOX = 0;
var PRIM_TYPE_CYLINDER = 1;
var PRIM_TYPE_PRISM = 2;
var PRIM_TYPE_RING = 6;
var PRIM_TYPE_SCULPT = 7;
var PRIM_TYPE_SPHERE = 3;
var PRIM_TYPE_TORUS = 4;
var PRIM_TYPE_TUBE = 5;
var PROFILE_NONE = 0;
var PROFILE_SCRIPT_MEMORY = 1;
var PSYS_PART_BF_DEST_COLOR = 2;
var PSYS_PART_BF_ONE = 0;
var PSYS_PART_BF_ONE_MINUS_DEST_COLOR = 4;
var PSYS_PART_BF_ONE_MINUS_SOURCE_ALPHA = 9;
var PSYS_PART_BF_ONE_MINUS_SOURCE_COLOR = 5;
var PSYS_PART_BF_SOURCE_ALPHA = 7;
var PSYS_PART_BF_SOURCE_COLOR = 3;
var PSYS_PART_BF_ZERO = 1;
var PSYS_PART_BLEND_FUNC_DEST = 25;
var PSYS_PART_BLEND_FUNC_SOURCE = 24;
var PSYS_PART_BOUNCE_MASK = 4;
var PSYS_PART_EMISSIVE_MASK = 256;
var PSYS_PART_END_ALPHA = 4;
var PSYS_PART_END_COLOR = 3;
var PSYS_PART_END_GLOW = 27;
var PSYS_PART_END_SCALE = 6;
var PSYS_PART_FLAGS = 0;
var PSYS_PART_FOLLOW_SRC_MASK = 16;
var PSYS_PART_FOLLOW_VELOCITY_MASK = 32;
var PSYS_PART_INTERP_COLOR_MASK = 1;
var PSYS_PART_INTERP_SCALE_MASK = 2;
var PSYS_PART_MAX_AGE = 7;
var PSYS_PART_RIBBON_MASK = 1024;
var PSYS_PART_START_ALPHA = 2;
var PSYS_PART_START_COLOR = 1;
var PSYS_PART_START_GLOW = 26;
var PSYS_PART_START_SCALE = 5;
var PSYS_PART_TARGET_LINEAR_MASK = 128;
var PSYS_PART_TARGET_POS_MASK = 64;
var PSYS_PART_WIND_MASK = 8;
var PSYS_SRC_ACCEL = 8;
var PSYS_SRC_ANGLE_BEGIN = 22;
var PSYS_SRC_ANGLE_END = 23;
var PSYS_SRC_BURST_PART_COUNT = 15;
var PSYS_SRC_BURST_RADIUS = 16;
var PSYS_SRC_BURST_RATE = 13;
var PSYS_SRC_BURST_SPEED_MAX = 18;
var PSYS_SRC_BURST_SPEED_MIN = 17;
var PSYS_SRC_MAX_AGE = 19;
var PSYS_SRC_OBJ_REL_MASK = 1;
var PSYS_SRC_OMEGA = 21;
var PSYS_SRC_PATTERN = 9;
var PSYS_SRC_PATTERN_ANGLE = 4;
var PSYS_SRC_PATTERN_ANGLE_CONE = 8;
var PSYS_SRC_PATTERN_ANGLE_CONE_EMPTY = 16;
var PSYS_SRC_PATTERN_DROP = 1;
var PSYS_SRC_PATTERN_EXPLODE = 2;
var PSYS_SRC_TARGET_KEY = 20;
var PSYS_SRC_TEXTURE = 12;
var PUBLIC_CHANNEL = 0;
var PURSUIT_FUZZ_FACTOR = 3;
var PURSUIT_GOAL_TOLERANCE = 5;
var PURSUIT_INTERCEPT = 4;
var PURSUIT_OFFSET = 1;
var PU_EVADE_HIDDEN = 7;
var PU_EVADE_SPOTTED = 8;
var PU_FAILURE_DYNAMIC_PATHFINDING_DISABLED = 10;
var PU_FAILURE_INVALID_GOAL = 3;
var PU_FAILURE_INVALID_START = 2;
var PU_FAILURE_NO_NAVMESH = 9;
var PU_FAILURE_NO_VALID_DESTINATION = 6;
var PU_FAILURE_OTHER = 1e6;
var PU_FAILURE_PARCEL_UNREACHABLE = 11;
var PU_FAILURE_TARGET_GONE = 5;
var PU_FAILURE_UNREACHABLE = 4;
var PU_GOAL_REACHED = 1;
var PU_SLOWDOWN_DISTANCE_REACHED = 0;
var RAD_TO_DEG = 57.2957795;
var RCERR_CAST_TIME_EXCEEDED = -3;
var RCERR_SIM_PERF_LOW = -2;
var RCERR_UNKNOWN = -1;
var RC_DATA_FLAGS = 2;
var RC_DETECT_PHANTOM = 1;
var RC_GET_LINK_NUM = 4;
var RC_GET_NORMAL = 1;
var RC_GET_ROOT_KEY = 2;
var RC_MAX_HITS = 3;
var RC_REJECT_AGENTS = 1;
var RC_REJECT_LAND = 8;
var RC_REJECT_NONPHYSICAL = 4;
var RC_REJECT_PHYSICAL = 2;
var RC_REJECT_TYPES = 0;
var REGION_FLAG_ALLOW_DAMAGE = 1;
var REGION_FLAG_ALLOW_DIRECT_TELEPORT = 1048576;
var REGION_FLAG_BLOCK_FLY = 524288;
var REGION_FLAG_BLOCK_FLYOVER = 134217728;
var REGION_FLAG_BLOCK_TERRAFORM = 64;
var REGION_FLAG_DISABLE_COLLISIONS = 4096;
var REGION_FLAG_DISABLE_PHYSICS = 16384;
var REGION_FLAG_FIXED_SUN = 16;
var REGION_FLAG_RESTRICT_PUSHOBJECT = 4194304;
var REGION_FLAG_SANDBOX = 256;
var REQUIRE_LINE_OF_SIGHT = 2;
var RESTITUTION = 4;
var REVERSE = 4;
var REZ_ACCEL = 5;
var REZ_DAMAGE = 8;
var REZ_DAMAGE_TYPE = 12;
var REZ_FLAGS = 1;
var REZ_FLAG_BLOCK_GRAB_OBJECT = 128;
var REZ_FLAG_DIE_ON_COLLIDE = 8;
var REZ_FLAG_DIE_ON_NOENTRY = 16;
var REZ_FLAG_NO_COLLIDE_FAMILY = 64;
var REZ_FLAG_NO_COLLIDE_OWNER = 32;
var REZ_FLAG_PHANTOM = 4;
var REZ_FLAG_PHYSICAL = 2;
var REZ_FLAG_TEMP = 1;
var REZ_LOCK_AXES = 11;
var REZ_OMEGA = 7;
var REZ_PARAM = 0;
var REZ_PARAM_STRING = 13;
var REZ_POS = 2;
var REZ_ROT = 3;
var REZ_SOUND = 9;
var REZ_SOUND_COLLIDE = 10;
var REZ_VEL = 4;
var ROTATE = 32;
var SCALE = 64;
var SCRIPTED = 8;
var SIM_STAT_ACTIVE_SCRIPT_COUNT = 12;
var SIM_STAT_AGENT_COUNT = 10;
var SIM_STAT_AGENT_MS = 7;
var SIM_STAT_AGENT_UPDATES = 2;
var SIM_STAT_AI_MS = 26;
var SIM_STAT_ASSET_DOWNLOADS = 15;
var SIM_STAT_ASSET_UPLOADS = 16;
var SIM_STAT_CHILD_AGENT_COUNT = 11;
var SIM_STAT_FRAME_MS = 3;
var SIM_STAT_IMAGE_MS = 8;
var SIM_STAT_IO_PUMP_MS = 24;
var SIM_STAT_NET_MS = 4;
var SIM_STAT_OTHER_MS = 5;
var SIM_STAT_PACKETS_IN = 13;
var SIM_STAT_PACKETS_OUT = 14;
var SIM_STAT_PCT_CHARS_STEPPED = 0;
var SIM_STAT_PHYSICS_FPS = 1;
var SIM_STAT_PHYSICS_MS = 6;
var SIM_STAT_PHYSICS_OTHER_MS = 20;
var SIM_STAT_PHYSICS_SHAPE_MS = 19;
var SIM_STAT_PHYSICS_STEP_MS = 18;
var SIM_STAT_SCRIPT_EPS = 21;
var SIM_STAT_SCRIPT_MS = 9;
var SIM_STAT_SCRIPT_RUN_PCT = 25;
var SIM_STAT_SLEEP_MS = 23;
var SIM_STAT_SPARE_MS = 22;
var SIM_STAT_UNACKED_BYTES = 17;
var SIT_FLAG_ALLOW_UNSIT = 2;
var SIT_FLAG_NO_COLLIDE = 16;
var SIT_FLAG_NO_DAMAGE = 32;
var SIT_FLAG_SCRIPTED_ONLY = 4;
var SIT_FLAG_SIT_TARGET = 1;
var SIT_INVALID_AGENT = -4;
var SIT_INVALID_LINK = -5;
var SIT_INVALID_OBJECT = -7;
var SIT_NOT_EXPERIENCE = -1;
var SIT_NO_ACCESS = -6;
var SIT_NO_EXPERIENCE_PERMISSION = -2;
var SIT_NO_SIT_TARGET = -3;
var SKY_ABSORPTION_CONFIG = 16;
var SKY_AMBIENT = 0;
var SKY_BLUE = 22;
var SKY_CLOUDS = 2;
var SKY_CLOUD_TEXTURE = 19;
var SKY_DENSITY_PROFILE_COUNTS = 3;
var SKY_DOME = 4;
var SKY_GAMMA = 5;
var SKY_GLOW = 6;
var SKY_HAZE = 23;
var SKY_LIGHT = 8;
var SKY_MIE_CONFIG = 17;
var SKY_MOON = 9;
var SKY_MOON_TEXTURE = 20;
var SKY_PLANET = 10;
var SKY_RAYLEIGH_CONFIG = 18;
var SKY_REFLECTION_PROBE_AMBIANCE = 24;
var SKY_REFRACTION = 11;
var SKY_STAR_BRIGHTNESS = 13;
var SKY_SUN = 14;
var SKY_SUN_TEXTURE = 21;
var SKY_TEXTURE_DEFAULTS = 1;
var SMOOTH = 16;
var SOUND_LOOP = 1;
var SOUND_PLAY = 0;
var SOUND_SYNC = 4;
var SOUND_TRIGGER = 2;
var SQRT2 = 1.41421356;
var STATUS_BLOCK_GRAB = 64;
var STATUS_BLOCK_GRAB_OBJECT = 1024;
var STATUS_BOUNDS_ERROR = 1002;
var STATUS_CAST_SHADOWS = 512;
var STATUS_DIE_AT_EDGE = 128;
var STATUS_DIE_AT_NO_ENTRY = 2048;
var STATUS_INTERNAL_ERROR = 1999;
var STATUS_MALFORMED_PARAMS = 1e3;
var STATUS_NOT_FOUND = 1003;
var STATUS_NOT_SUPPORTED = 1004;
var STATUS_OK = 0;
var STATUS_PHANTOM = 16;
var STATUS_PHYSICS = 1;
var STATUS_RETURN_AT_EDGE = 256;
var STATUS_ROTATE_X = 2;
var STATUS_ROTATE_Y = 4;
var STATUS_ROTATE_Z = 8;
var STATUS_SANDBOX = 32;
var STATUS_TYPE_MISMATCH = 1001;
var STATUS_WHITELIST_FAILED = 2001;
var STRING_TRIM = 3;
var STRING_TRIM_HEAD = 1;
var STRING_TRIM_TAIL = 2;
var TARGETED_EMAIL_OBJECT_OWNER = 2;
var TARGETED_EMAIL_ROOT_CREATOR = 1;
var TEXTURE_BLANK = "5748decc-f629-461c-9a36-a35a221fe21f";
var TEXTURE_DEFAULT = "89556747-24cb-43ed-920b-47caed15465f";
var TEXTURE_MEDIA = "8b5fec65-8d8d-9dc5-cda8-8fdf2716e361";
var TEXTURE_PLYWOOD = "89556747-24cb-43ed-920b-47caed15465f";
var TEXTURE_TRANSPARENT = "8dcd4a48-2d37-4909-9f78-f7a9eb4ef903";
var TOUCH_INVALID_FACE = -1;
var TOUCH_INVALID_TEXCOORD = Object.freeze({ x: -1, y: -1, z: 0 });
var TOUCH_INVALID_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });
var TP_ROUTING_BLOCKED = 0;
var TP_ROUTING_FREE = 2;
var TP_ROUTING_LANDINGP = 1;
var TRANSFER_BAD_OPTS = -1;
var TRANSFER_BAD_ROOT = -5;
var TRANSFER_DEST = 0;
var TRANSFER_FLAGS = 1;
var TRANSFER_FLAG_COPY = 4;
var TRANSFER_FLAG_RESERVED = 1;
var TRANSFER_FLAG_TAKE = 2;
var TRANSFER_NO_ATTACHMENT = -7;
var TRANSFER_NO_ITEMS = -4;
var TRANSFER_NO_PERMS = -6;
var TRANSFER_NO_TARGET = -2;
var TRANSFER_OK = 0;
var TRANSFER_THROTTLE = -3;
var TRAVERSAL_TYPE = 7;
var TRAVERSAL_TYPE_FAST = 1;
var TRAVERSAL_TYPE_NONE = 2;
var TRAVERSAL_TYPE_SLOW = 0;
var TRUE = 1;
var TWO_PI = 6.2831853;
var TYPE_FLOAT = 2;
var TYPE_INTEGER = 1;
var TYPE_INVALID = 0;
var TYPE_KEY = 4;
var TYPE_ROTATION = 6;
var TYPE_STRING = 3;
var TYPE_VECTOR = 5;
var URL_REQUEST_DENIED = "URL_REQUEST_DENIED";
var URL_REQUEST_GRANTED = "URL_REQUEST_GRANTED";
var VEHICLE_ANGULAR_DEFLECTION_EFFICIENCY = 32;
var VEHICLE_ANGULAR_DEFLECTION_TIMESCALE = 33;
var VEHICLE_ANGULAR_FRICTION_TIMESCALE = 17;
var VEHICLE_ANGULAR_MOTOR_DECAY_TIMESCALE = 35;
var VEHICLE_ANGULAR_MOTOR_DIRECTION = 19;
var VEHICLE_ANGULAR_MOTOR_TIMESCALE = 34;
var VEHICLE_BANKING_EFFICIENCY = 38;
var VEHICLE_BANKING_MIX = 39;
var VEHICLE_BANKING_TIMESCALE = 40;
var VEHICLE_BUOYANCY = 27;
var VEHICLE_FLAG_BLOCK_INTERFERENCE = 1024;
var VEHICLE_FLAG_CAMERA_DECOUPLED = 512;
var VEHICLE_FLAG_HOVER_GLOBAL_HEIGHT = 16;
var VEHICLE_FLAG_HOVER_TERRAIN_ONLY = 8;
var VEHICLE_FLAG_HOVER_UP_ONLY = 32;
var VEHICLE_FLAG_HOVER_WATER_ONLY = 4;
var VEHICLE_FLAG_LIMIT_MOTOR_UP = 64;
var VEHICLE_FLAG_LIMIT_ROLL_ONLY = 2;
var VEHICLE_FLAG_MOUSELOOK_BANK = 256;
var VEHICLE_FLAG_MOUSELOOK_STEER = 128;
var VEHICLE_FLAG_NO_DEFLECTION_UP = 1;
var VEHICLE_HOVER_EFFICIENCY = 25;
var VEHICLE_HOVER_HEIGHT = 24;
var VEHICLE_HOVER_TIMESCALE = 26;
var VEHICLE_LINEAR_DEFLECTION_EFFICIENCY = 28;
var VEHICLE_LINEAR_DEFLECTION_TIMESCALE = 29;
var VEHICLE_LINEAR_FRICTION_TIMESCALE = 16;
var VEHICLE_LINEAR_MOTOR_DECAY_TIMESCALE = 31;
var VEHICLE_LINEAR_MOTOR_DIRECTION = 18;
var VEHICLE_LINEAR_MOTOR_OFFSET = 20;
var VEHICLE_LINEAR_MOTOR_TIMESCALE = 30;
var VEHICLE_REFERENCE_FRAME = 44;
var VEHICLE_TYPE_AIRPLANE = 4;
var VEHICLE_TYPE_BALLOON = 5;
var VEHICLE_TYPE_BOAT = 3;
var VEHICLE_TYPE_CAR = 2;
var VEHICLE_TYPE_NONE = 0;
var VEHICLE_TYPE_SLED = 1;
var VEHICLE_VERTICAL_ATTRACTION_EFFICIENCY = 36;
var VEHICLE_VERTICAL_ATTRACTION_TIMESCALE = 37;
var VERTICAL = 0;
var WANDER_PAUSE_AT_WAYPOINTS = 0;
var WATER_BLUR_MULTIPLIER = 100;
var WATER_FOG = 101;
var WATER_FRESNEL = 102;
var WATER_NORMAL_SCALE = 104;
var WATER_NORMAL_TEXTURE = 107;
var WATER_REFRACTION = 105;
var WATER_TEXTURE_DEFAULTS = 103;
var WATER_WAVE_DIRECTION = 106;
var XP_ERROR_EXPERIENCES_DISABLED = 2;
var XP_ERROR_EXPERIENCE_DISABLED = 8;
var XP_ERROR_EXPERIENCE_SUSPENDED = 9;
var XP_ERROR_INVALID_EXPERIENCE = 7;
var XP_ERROR_INVALID_PARAMETERS = 3;
var XP_ERROR_KEY_NOT_FOUND = 14;
var XP_ERROR_MATURITY_EXCEEDED = 16;
var XP_ERROR_NONE = 0;
var XP_ERROR_NOT_FOUND = 6;
var XP_ERROR_NOT_PERMITTED = 4;
var XP_ERROR_NOT_PERMITTED_LAND = 17;
var XP_ERROR_NO_EXPERIENCE = 5;
var XP_ERROR_QUOTA_EXCEEDED = 11;
var XP_ERROR_REQUEST_PERM_TIMEOUT = 18;
var XP_ERROR_RETRY_UPDATE = 15;
var XP_ERROR_STORAGE_EXCEPTION = 13;
var XP_ERROR_STORE_DISABLED = 12;
var XP_ERROR_THROTTLED = 1;
var XP_ERROR_UNKNOWN_ERROR = 10;

// packages/vm/dist/builtins/object.js
var llSetText = (ctx, args) => {
  const text = args[0] ?? "";
  const color = args[1] ?? { x: 1, y: 1, z: 1 };
  const alpha = args[2] ?? 1;
  ctx.prim.setPrimParam(PRIM_TEXT, [text, color, alpha], 0);
  return void 0;
};
var llSetObjectDesc = (ctx, args) => {
  const desc = args[0] ?? "";
  ctx.prim.setPrimParam(PRIM_DESC, [desc], 0);
  return void 0;
};
var llGetObjectDesc = (ctx) => ctx.prim.description;
var llDie = (ctx) => {
  for (const s of ctx.linkset.allScripts()) {
    s.markDead();
  }
  return void 0;
};
var ResetScriptSignal = class {
};
var llResetScript = () => {
  throw new ResetScriptSignal();
};

// packages/vm/dist/random.js
var Mulberry32 = class {
  state;
  constructor(seed) {
    this.state = (seed | 0) >>> 0 || 1;
  }
  /** Next float in [0, 1). */
  next() {
    this.state = this.state + 1831565813 | 0;
    let t = this.state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  /** Float in [0, max). */
  nextFloat(max) {
    return this.next() * max;
  }
  /** Integer in [0, max). */
  nextInt(max) {
    return Math.floor(this.nextFloat(max));
  }
};

// packages/vm/dist/values/types.js
var ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });
var ZERO_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, s: 1 });
var NULL_KEY = "00000000-0000-0000-0000-000000000000";
function defaultValueFor(type) {
  switch (type) {
    case "integer":
      return 0;
    case "float":
      return 0;
    case "string":
      return "";
    case "key":
      return NULL_KEY;
    case "vector":
      return ZERO_VECTOR;
    case "rotation":
      return ZERO_ROTATION;
    case "list":
      return [];
    case "void":
      return void 0;
  }
}
function defaultEvalFor(type) {
  return { value: defaultValueFor(type) ?? 0, type };
}
function toInt32(n) {
  if (!Number.isFinite(n))
    return 0;
  return n | 0;
}
function isVector(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "x" in v && "y" in v && "z" in v && !("s" in v);
}
function isRotation(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "x" in v && "y" in v && "z" in v && "s" in v;
}
function vec(x, y, z) {
  return Object.freeze({ x, y, z });
}
function rot(x, y, z, s) {
  return Object.freeze({ x, y, z, s });
}

// packages/vm/dist/generated/functions.js
var BUILTIN_SPECS = {
  "llAbs": { name: "llAbs", returnType: "integer", delay: 0, status: "normal", params: [{ name: "val", type: "integer" }] },
  "llAcos": { name: "llAcos", returnType: "float", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llAddToLandBanList": { name: "llAddToLandBanList", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "avatar", type: "key" }, { name: "hours", type: "float" }] },
  "llAddToLandPassList": { name: "llAddToLandPassList", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "avatar", type: "key" }, { name: "hours", type: "float" }] },
  "llAdjustDamage": { name: "llAdjustDamage", returnType: "void", delay: 0, status: "normal", params: [{ name: "index", type: "integer" }, { name: "damage", type: "float" }] },
  "llAdjustSoundVolume": { name: "llAdjustSoundVolume", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "volume", type: "float" }] },
  "llAgentInExperience": { name: "llAgentInExperience", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }] },
  "llAllowInventoryDrop": { name: "llAllowInventoryDrop", returnType: "void", delay: 0, status: "normal", params: [{ name: "add", type: "integer" }] },
  "llAngleBetween": { name: "llAngleBetween", returnType: "float", delay: 0, status: "normal", params: [{ name: "a", type: "rotation" }, { name: "b", type: "rotation" }] },
  "llApplyImpulse": { name: "llApplyImpulse", returnType: "void", delay: 0, status: "normal", params: [{ name: "force", type: "vector" }, { name: "local", type: "integer" }] },
  "llApplyRotationalImpulse": { name: "llApplyRotationalImpulse", returnType: "void", delay: 0, status: "normal", params: [{ name: "force", type: "vector" }, { name: "local", type: "integer" }] },
  "llAsin": { name: "llAsin", returnType: "float", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llAtan2": { name: "llAtan2", returnType: "float", delay: 0, status: "normal", params: [{ name: "y", type: "float" }, { name: "x", type: "float" }] },
  "llAttachToAvatar": { name: "llAttachToAvatar", returnType: "void", delay: 0, status: "normal", params: [{ name: "attach_point", type: "integer" }] },
  "llAttachToAvatarTemp": { name: "llAttachToAvatarTemp", returnType: "void", delay: 0, status: "normal", params: [{ name: "attach_point", type: "integer" }] },
  "llAvatarOnLinkSitTarget": { name: "llAvatarOnLinkSitTarget", returnType: "key", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }] },
  "llAvatarOnSitTarget": { name: "llAvatarOnSitTarget", returnType: "key", delay: 0, status: "normal", params: [] },
  "llAxes2Rot": { name: "llAxes2Rot", returnType: "rotation", delay: 0, status: "normal", params: [{ name: "fwd", type: "vector" }, { name: "left", type: "vector" }, { name: "up", type: "vector" }] },
  "llAxisAngle2Rot": { name: "llAxisAngle2Rot", returnType: "rotation", delay: 0, status: "normal", params: [{ name: "axis", type: "vector" }, { name: "angle", type: "float" }] },
  "llBase64ToInteger": { name: "llBase64ToInteger", returnType: "integer", delay: 0, status: "normal", params: [{ name: "str", type: "string" }] },
  "llBase64ToString": { name: "llBase64ToString", returnType: "string", delay: 0, status: "normal", params: [{ name: "str", type: "string" }] },
  "llBreakAllLinks": { name: "llBreakAllLinks", returnType: "void", delay: 0, status: "normal", params: [] },
  "llBreakLink": { name: "llBreakLink", returnType: "void", delay: 0, status: "normal", params: [{ name: "linknum", type: "integer" }] },
  "llCSV2List": { name: "llCSV2List", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "string" }] },
  "llCastRay": { name: "llCastRay", returnType: "list", delay: 0, status: "normal", params: [{ name: "start", type: "vector" }, { name: "end", type: "vector" }, { name: "params", type: "list" }] },
  "llCeil": { name: "llCeil", returnType: "integer", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llChar": { name: "llChar", returnType: "string", delay: 0, status: "normal", params: [{ name: "code", type: "integer" }] },
  "llClearCameraParams": { name: "llClearCameraParams", returnType: "void", delay: 0, status: "normal", params: [] },
  "llClearExperiencePermissions": { name: "llClearExperiencePermissions", returnType: "void", delay: 0, status: "unimplemented", params: [{ name: "agent", type: "key" }] },
  "llClearLinkMedia": { name: "llClearLinkMedia", returnType: "integer", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "face", type: "integer" }] },
  "llClearPrimMedia": { name: "llClearPrimMedia", returnType: "integer", delay: 1, status: "normal", params: [{ name: "face", type: "integer" }] },
  "llCloseRemoteDataChannel": { name: "llCloseRemoteDataChannel", returnType: "void", delay: 1, status: "deprecated", params: [{ name: "channel", type: "key" }] },
  "llCloud": { name: "llCloud", returnType: "float", delay: 0, status: "unimplemented", params: [{ name: "offset", type: "vector" }] },
  "llCollisionFilter": { name: "llCollisionFilter", returnType: "void", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "id", type: "key" }, { name: "accept", type: "integer" }] },
  "llCollisionSound": { name: "llCollisionSound", returnType: "void", delay: 0, status: "normal", params: [{ name: "impact_sound", type: "string" }, { name: "impact_volume", type: "float" }] },
  "llCollisionSprite": { name: "llCollisionSprite", returnType: "void", delay: 0, status: "unimplemented", params: [{ name: "impact_sprite", type: "string" }] },
  "llComputeHash": { name: "llComputeHash", returnType: "string", delay: 0, status: "normal", params: [{ name: "data", type: "string" }, { name: "algorithm", type: "string" }] },
  "llCos": { name: "llCos", returnType: "float", delay: 0, status: "normal", params: [{ name: "theta", type: "float" }] },
  "llCreateCharacter": { name: "llCreateCharacter", returnType: "void", delay: 0, status: "normal", params: [{ name: "options", type: "list" }] },
  "llCreateKeyValue": { name: "llCreateKeyValue", returnType: "key", delay: 0, status: "normal", params: [{ name: "k", type: "string" }, { name: "v", type: "string" }] },
  "llCreateLink": { name: "llCreateLink", returnType: "void", delay: 1, status: "normal", params: [{ name: "target", type: "key" }, { name: "parent", type: "integer" }] },
  "llDamage": { name: "llDamage", returnType: "void", delay: 0, status: "normal", params: [{ name: "id", type: "key" }, { name: "damage", type: "float" }, { name: "damage_type", type: "integer" }] },
  "llDataSizeKeyValue": { name: "llDataSizeKeyValue", returnType: "key", delay: 0, status: "normal", params: [] },
  "llDeleteCharacter": { name: "llDeleteCharacter", returnType: "void", delay: 0, status: "normal", params: [] },
  "llDeleteKeyValue": { name: "llDeleteKeyValue", returnType: "key", delay: 0, status: "normal", params: [{ name: "k", type: "string" }] },
  "llDeleteSubList": { name: "llDeleteSubList", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }] },
  "llDeleteSubString": { name: "llDeleteSubString", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }] },
  "llDerezObject": { name: "llDerezObject", returnType: "integer", delay: 0, status: "normal", params: [{ name: "id", type: "key" }, { name: "mode", type: "integer" }] },
  "llDetachFromAvatar": { name: "llDetachFromAvatar", returnType: "void", delay: 0, status: "normal", params: [] },
  "llDetectedDamage": { name: "llDetectedDamage", returnType: "list", delay: 0, status: "normal", params: [{ name: "index", type: "integer" }] },
  "llDetectedGrab": { name: "llDetectedGrab", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedGroup": { name: "llDetectedGroup", returnType: "integer", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedKey": { name: "llDetectedKey", returnType: "key", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedLinkNumber": { name: "llDetectedLinkNumber", returnType: "integer", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedName": { name: "llDetectedName", returnType: "string", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedOwner": { name: "llDetectedOwner", returnType: "key", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedPos": { name: "llDetectedPos", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedRezzer": { name: "llDetectedRezzer", returnType: "key", delay: 0, status: "normal", params: [{ name: "index", type: "integer" }] },
  "llDetectedRot": { name: "llDetectedRot", returnType: "rotation", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedTouchBinormal": { name: "llDetectedTouchBinormal", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedTouchFace": { name: "llDetectedTouchFace", returnType: "integer", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedTouchNormal": { name: "llDetectedTouchNormal", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedTouchPos": { name: "llDetectedTouchPos", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedTouchST": { name: "llDetectedTouchST", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedTouchUV": { name: "llDetectedTouchUV", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedType": { name: "llDetectedType", returnType: "integer", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDetectedVel": { name: "llDetectedVel", returnType: "vector", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llDialog": { name: "llDialog", returnType: "void", delay: 1, status: "normal", params: [{ name: "avatar", type: "key" }, { name: "message", type: "string" }, { name: "buttons", type: "list" }, { name: "chat_channel", type: "integer" }] },
  "llDie": { name: "llDie", returnType: "void", delay: 0, status: "normal", params: [] },
  "llDumpList2String": { name: "llDumpList2String", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "separator", type: "string" }] },
  "llEdgeOfWorld": { name: "llEdgeOfWorld", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }, { name: "dir", type: "vector" }] },
  "llEjectFromLand": { name: "llEjectFromLand", returnType: "void", delay: 0, status: "normal", params: [{ name: "avatar", type: "key" }] },
  "llEmail": { name: "llEmail", returnType: "void", delay: 20, status: "normal", params: [{ name: "address", type: "string" }, { name: "subject", type: "string" }, { name: "message", type: "string" }] },
  "llEscapeURL": { name: "llEscapeURL", returnType: "string", delay: 0, status: "normal", params: [{ name: "url", type: "string" }] },
  "llEuler2Rot": { name: "llEuler2Rot", returnType: "rotation", delay: 0, status: "normal", params: [{ name: "v", type: "vector" }] },
  "llEvade": { name: "llEvade", returnType: "void", delay: 0, status: "normal", params: [{ name: "target", type: "key" }, { name: "options", type: "list" }] },
  "llExecCharacterCmd": { name: "llExecCharacterCmd", returnType: "void", delay: 0, status: "normal", params: [{ name: "cmd", type: "integer" }, { name: "options", type: "list" }] },
  "llFabs": { name: "llFabs", returnType: "float", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llFindNotecardTextCount": { name: "llFindNotecardTextCount", returnType: "key", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "pattern", type: "string" }, { name: "options", type: "list" }] },
  "llFindNotecardTextSync": { name: "llFindNotecardTextSync", returnType: "list", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "pattern", type: "string" }, { name: "start", type: "integer" }, { name: "count", type: "integer" }, { name: "options", type: "list" }] },
  "llFleeFrom": { name: "llFleeFrom", returnType: "void", delay: 0, status: "normal", params: [{ name: "source", type: "vector" }, { name: "radius", type: "float" }, { name: "options", type: "list" }] },
  "llFloor": { name: "llFloor", returnType: "integer", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llForceMouselook": { name: "llForceMouselook", returnType: "void", delay: 0, status: "normal", params: [{ name: "mouselook", type: "integer" }] },
  "llFrand": { name: "llFrand", returnType: "float", delay: 0, status: "normal", params: [{ name: "mag", type: "float" }] },
  "llGenerateKey": { name: "llGenerateKey", returnType: "key", delay: 0, status: "normal", params: [] },
  "llGetAccel": { name: "llGetAccel", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetAgentInfo": { name: "llGetAgentInfo", returnType: "integer", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetAgentLanguage": { name: "llGetAgentLanguage", returnType: "string", delay: 0, status: "normal", params: [{ name: "avatar", type: "key" }] },
  "llGetAgentList": { name: "llGetAgentList", returnType: "list", delay: 0, status: "normal", params: [{ name: "scope", type: "integer" }, { name: "options", type: "list" }] },
  "llGetAgentSize": { name: "llGetAgentSize", returnType: "vector", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetAlpha": { name: "llGetAlpha", returnType: "float", delay: 0, status: "normal", params: [{ name: "face", type: "integer" }] },
  "llGetAndResetTime": { name: "llGetAndResetTime", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetAnimation": { name: "llGetAnimation", returnType: "string", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetAnimationList": { name: "llGetAnimationList", returnType: "list", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetAnimationOverride": { name: "llGetAnimationOverride", returnType: "string", delay: 0, status: "normal", params: [{ name: "anim_state", type: "string" }] },
  "llGetAttached": { name: "llGetAttached", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetAttachedList": { name: "llGetAttachedList", returnType: "list", delay: 0, status: "normal", params: [{ name: "avatar", type: "key" }] },
  "llGetAttachedListFiltered": { name: "llGetAttachedListFiltered", returnType: "list", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }, { name: "options", type: "list" }] },
  "llGetBoundingBox": { name: "llGetBoundingBox", returnType: "list", delay: 0, status: "normal", params: [{ name: "object", type: "key" }] },
  "llGetCameraAspect": { name: "llGetCameraAspect", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetCameraFOV": { name: "llGetCameraFOV", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetCameraPos": { name: "llGetCameraPos", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetCameraRot": { name: "llGetCameraRot", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetCenterOfMass": { name: "llGetCenterOfMass", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetClosestNavPoint": { name: "llGetClosestNavPoint", returnType: "list", delay: 0, status: "normal", params: [{ name: "point", type: "vector" }, { name: "options", type: "list" }] },
  "llGetColor": { name: "llGetColor", returnType: "vector", delay: 0, status: "normal", params: [{ name: "face", type: "integer" }] },
  "llGetCreator": { name: "llGetCreator", returnType: "key", delay: 0, status: "normal", params: [] },
  "llGetDate": { name: "llGetDate", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetDayLength": { name: "llGetDayLength", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetDayOffset": { name: "llGetDayOffset", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetDisplayName": { name: "llGetDisplayName", returnType: "string", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetEnergy": { name: "llGetEnergy", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetEnv": { name: "llGetEnv", returnType: "string", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llGetEnvironment": { name: "llGetEnvironment", returnType: "list", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }, { name: "params", type: "list" }] },
  "llGetExperienceDetails": { name: "llGetExperienceDetails", returnType: "list", delay: 0, status: "normal", params: [{ name: "experience_id", type: "key" }] },
  "llGetExperienceErrorMessage": { name: "llGetExperienceErrorMessage", returnType: "string", delay: 0, status: "normal", params: [{ name: "value", type: "integer" }] },
  "llGetExperienceList": { name: "llGetExperienceList", returnType: "list", delay: 0, status: "unimplemented", params: [{ name: "agent", type: "key" }] },
  "llGetForce": { name: "llGetForce", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetFreeMemory": { name: "llGetFreeMemory", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetFreeURLs": { name: "llGetFreeURLs", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetGMTclock": { name: "llGetGMTclock", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetGeometricCenter": { name: "llGetGeometricCenter", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetHTTPHeader": { name: "llGetHTTPHeader", returnType: "string", delay: 0, status: "normal", params: [{ name: "request_id", type: "key" }, { name: "header", type: "string" }] },
  "llGetHealth": { name: "llGetHealth", returnType: "float", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetInventoryAcquireTime": { name: "llGetInventoryAcquireTime", returnType: "string", delay: 0, status: "normal", params: [{ name: "item", type: "string" }] },
  "llGetInventoryCreator": { name: "llGetInventoryCreator", returnType: "key", delay: 0, status: "normal", params: [{ name: "item", type: "string" }] },
  "llGetInventoryDesc": { name: "llGetInventoryDesc", returnType: "string", delay: 0, status: "normal", params: [{ name: "itemname", type: "string" }] },
  "llGetInventoryKey": { name: "llGetInventoryKey", returnType: "key", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llGetInventoryName": { name: "llGetInventoryName", returnType: "string", delay: 0, status: "normal", params: [{ name: "type", type: "integer" }, { name: "number", type: "integer" }] },
  "llGetInventoryNumber": { name: "llGetInventoryNumber", returnType: "integer", delay: 0, status: "normal", params: [{ name: "type", type: "integer" }] },
  "llGetInventoryPermMask": { name: "llGetInventoryPermMask", returnType: "integer", delay: 0, status: "normal", params: [{ name: "item", type: "string" }, { name: "mask", type: "integer" }] },
  "llGetInventoryType": { name: "llGetInventoryType", returnType: "integer", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llGetKey": { name: "llGetKey", returnType: "key", delay: 0, status: "normal", params: [] },
  "llGetLandOwnerAt": { name: "llGetLandOwnerAt", returnType: "key", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llGetLinkKey": { name: "llGetLinkKey", returnType: "key", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }] },
  "llGetLinkMedia": { name: "llGetLinkMedia", returnType: "list", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "face", type: "integer" }, { name: "params", type: "list" }] },
  "llGetLinkName": { name: "llGetLinkName", returnType: "string", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }] },
  "llGetLinkNumber": { name: "llGetLinkNumber", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetLinkNumberOfSides": { name: "llGetLinkNumberOfSides", returnType: "integer", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }] },
  "llGetLinkPrimitiveParams": { name: "llGetLinkPrimitiveParams", returnType: "list", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "rules", type: "list" }] },
  "llGetLinkSitFlags": { name: "llGetLinkSitFlags", returnType: "integer", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }] },
  "llGetListEntryType": { name: "llGetListEntryType", returnType: "integer", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llGetListLength": { name: "llGetListLength", returnType: "integer", delay: 0, status: "normal", params: [{ name: "src", type: "list" }] },
  "llGetLocalPos": { name: "llGetLocalPos", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetLocalRot": { name: "llGetLocalRot", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetMass": { name: "llGetMass", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetMassMKS": { name: "llGetMassMKS", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetMaxScaleFactor": { name: "llGetMaxScaleFactor", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetMemoryLimit": { name: "llGetMemoryLimit", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetMinScaleFactor": { name: "llGetMinScaleFactor", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetMoonDirection": { name: "llGetMoonDirection", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetMoonRotation": { name: "llGetMoonRotation", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetNextEmail": { name: "llGetNextEmail", returnType: "void", delay: 0, status: "normal", params: [{ name: "address", type: "string" }, { name: "subject", type: "string" }] },
  "llGetNotecardLine": { name: "llGetNotecardLine", returnType: "key", delay: 0.1, status: "normal", params: [{ name: "name", type: "string" }, { name: "line", type: "integer" }] },
  "llGetNotecardLineSync": { name: "llGetNotecardLineSync", returnType: "string", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "line", type: "integer" }] },
  "llGetNumberOfNotecardLines": { name: "llGetNumberOfNotecardLines", returnType: "key", delay: 0.1, status: "normal", params: [{ name: "name", type: "string" }] },
  "llGetNumberOfPrims": { name: "llGetNumberOfPrims", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetNumberOfSides": { name: "llGetNumberOfSides", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetObjectAnimationNames": { name: "llGetObjectAnimationNames", returnType: "list", delay: 0, status: "normal", params: [] },
  "llGetObjectDesc": { name: "llGetObjectDesc", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetObjectDetails": { name: "llGetObjectDetails", returnType: "list", delay: 0, status: "normal", params: [{ name: "id", type: "key" }, { name: "params", type: "list" }] },
  "llGetObjectLinkKey": { name: "llGetObjectLinkKey", returnType: "key", delay: 0, status: "normal", params: [{ name: "object_id", type: "key" }, { name: "link", type: "integer" }] },
  "llGetObjectMass": { name: "llGetObjectMass", returnType: "float", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetObjectName": { name: "llGetObjectName", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetObjectPermMask": { name: "llGetObjectPermMask", returnType: "integer", delay: 0, status: "normal", params: [{ name: "mask", type: "integer" }] },
  "llGetObjectPrimCount": { name: "llGetObjectPrimCount", returnType: "integer", delay: 0, status: "normal", params: [{ name: "object_id", type: "key" }] },
  "llGetOmega": { name: "llGetOmega", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetOwner": { name: "llGetOwner", returnType: "key", delay: 0, status: "normal", params: [] },
  "llGetOwnerKey": { name: "llGetOwnerKey", returnType: "key", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetParcelDetails": { name: "llGetParcelDetails", returnType: "list", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }, { name: "params", type: "list" }] },
  "llGetParcelFlags": { name: "llGetParcelFlags", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llGetParcelMaxPrims": { name: "llGetParcelMaxPrims", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }, { name: "sim_wide", type: "integer" }] },
  "llGetParcelMusicURL": { name: "llGetParcelMusicURL", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetParcelPrimCount": { name: "llGetParcelPrimCount", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }, { name: "category", type: "integer" }, { name: "sim_wide", type: "integer" }] },
  "llGetParcelPrimOwners": { name: "llGetParcelPrimOwners", returnType: "list", delay: 2, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llGetPermissions": { name: "llGetPermissions", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetPermissionsKey": { name: "llGetPermissionsKey", returnType: "key", delay: 0, status: "normal", params: [] },
  "llGetPhysicsMaterial": { name: "llGetPhysicsMaterial", returnType: "list", delay: 0, status: "normal", params: [] },
  "llGetPos": { name: "llGetPos", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetPrimMediaParams": { name: "llGetPrimMediaParams", returnType: "list", delay: 1, status: "normal", params: [{ name: "face", type: "integer" }, { name: "params", type: "list" }] },
  "llGetPrimitiveParams": { name: "llGetPrimitiveParams", returnType: "list", delay: 0.2, status: "normal", params: [{ name: "params", type: "list" }] },
  "llGetRegionAgentCount": { name: "llGetRegionAgentCount", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetRegionCorner": { name: "llGetRegionCorner", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetRegionDayLength": { name: "llGetRegionDayLength", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetRegionDayOffset": { name: "llGetRegionDayOffset", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetRegionFPS": { name: "llGetRegionFPS", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetRegionFlags": { name: "llGetRegionFlags", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetRegionMoonDirection": { name: "llGetRegionMoonDirection", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetRegionMoonRotation": { name: "llGetRegionMoonRotation", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetRegionName": { name: "llGetRegionName", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetRegionSunDirection": { name: "llGetRegionSunDirection", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetRegionSunRotation": { name: "llGetRegionSunRotation", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetRegionTimeDilation": { name: "llGetRegionTimeDilation", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetRegionTimeOfDay": { name: "llGetRegionTimeOfDay", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetRenderMaterial": { name: "llGetRenderMaterial", returnType: "string", delay: 0, status: "normal", params: [{ name: "face", type: "integer" }] },
  "llGetRootPosition": { name: "llGetRootPosition", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetRootRotation": { name: "llGetRootRotation", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetRot": { name: "llGetRot", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetSPMaxMemory": { name: "llGetSPMaxMemory", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetScale": { name: "llGetScale", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetScriptName": { name: "llGetScriptName", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetScriptState": { name: "llGetScriptState", returnType: "integer", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llGetSimStats": { name: "llGetSimStats", returnType: "float", delay: 0, status: "normal", params: [{ name: "stat_type", type: "integer" }] },
  "llGetSimulatorHostname": { name: "llGetSimulatorHostname", returnType: "string", delay: 10, status: "normal", params: [] },
  "llGetStartParameter": { name: "llGetStartParameter", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetStartString": { name: "llGetStartString", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetStaticPath": { name: "llGetStaticPath", returnType: "list", delay: 0, status: "normal", params: [{ name: "start", type: "vector" }, { name: "end", type: "vector" }, { name: "radius", type: "float" }, { name: "params", type: "list" }] },
  "llGetStatus": { name: "llGetStatus", returnType: "integer", delay: 0, status: "normal", params: [{ name: "status", type: "integer" }] },
  "llGetSubString": { name: "llGetSubString", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }] },
  "llGetSunDirection": { name: "llGetSunDirection", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetSunRotation": { name: "llGetSunRotation", returnType: "rotation", delay: 0, status: "normal", params: [] },
  "llGetTexture": { name: "llGetTexture", returnType: "string", delay: 0, status: "normal", params: [{ name: "face", type: "integer" }] },
  "llGetTextureOffset": { name: "llGetTextureOffset", returnType: "vector", delay: 0, status: "normal", params: [{ name: "face", type: "integer" }] },
  "llGetTextureRot": { name: "llGetTextureRot", returnType: "float", delay: 0, status: "normal", params: [{ name: "side", type: "integer" }] },
  "llGetTextureScale": { name: "llGetTextureScale", returnType: "vector", delay: 0, status: "normal", params: [{ name: "side", type: "integer" }] },
  "llGetTime": { name: "llGetTime", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetTimeOfDay": { name: "llGetTimeOfDay", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGetTimestamp": { name: "llGetTimestamp", returnType: "string", delay: 0, status: "normal", params: [] },
  "llGetTorque": { name: "llGetTorque", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetUnixTime": { name: "llGetUnixTime", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetUsedMemory": { name: "llGetUsedMemory", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llGetUsername": { name: "llGetUsername", returnType: "string", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llGetVel": { name: "llGetVel", returnType: "vector", delay: 0, status: "normal", params: [] },
  "llGetVisualParams": { name: "llGetVisualParams", returnType: "list", delay: 0, status: "normal", params: [{ name: "agentid", type: "key" }, { name: "params", type: "list" }] },
  "llGetWallclock": { name: "llGetWallclock", returnType: "float", delay: 0, status: "normal", params: [] },
  "llGiveAgentInventory": { name: "llGiveAgentInventory", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }, { name: "folder", type: "string" }, { name: "items", type: "list" }, { name: "options", type: "list" }] },
  "llGiveInventory": { name: "llGiveInventory", returnType: "void", delay: 0, status: "normal", params: [{ name: "destination", type: "key" }, { name: "inventory", type: "string" }] },
  "llGiveInventoryList": { name: "llGiveInventoryList", returnType: "void", delay: 3, status: "normal", params: [{ name: "target", type: "key" }, { name: "folder", type: "string" }, { name: "inventory", type: "list" }] },
  "llGiveMoney": { name: "llGiveMoney", returnType: "integer", delay: 0, status: "normal", params: [{ name: "destination", type: "key" }, { name: "amount", type: "integer" }] },
  "llGodLikeRezObject": { name: "llGodLikeRezObject", returnType: "void", delay: 0, status: "godmode", params: [{ name: "inventory", type: "key" }, { name: "pos", type: "vector" }] },
  "llGround": { name: "llGround", returnType: "float", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llGroundContour": { name: "llGroundContour", returnType: "vector", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llGroundNormal": { name: "llGroundNormal", returnType: "vector", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llGroundRepel": { name: "llGroundRepel", returnType: "void", delay: 0, status: "normal", params: [{ name: "height", type: "float" }, { name: "water", type: "integer" }, { name: "tau", type: "float" }] },
  "llGroundSlope": { name: "llGroundSlope", returnType: "vector", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llHMAC": { name: "llHMAC", returnType: "string", delay: 0, status: "normal", params: [{ name: "authkey", type: "string" }, { name: "message", type: "string" }, { name: "hashalg", type: "string" }] },
  "llHTTPRequest": { name: "llHTTPRequest", returnType: "key", delay: 0, status: "normal", params: [{ name: "url", type: "string" }, { name: "parameters", type: "list" }, { name: "body", type: "string" }] },
  "llHTTPResponse": { name: "llHTTPResponse", returnType: "void", delay: 0, status: "normal", params: [{ name: "request_id", type: "key" }, { name: "status", type: "integer" }, { name: "body", type: "string" }] },
  "llHash": { name: "llHash", returnType: "integer", delay: 0, status: "normal", params: [{ name: "val", type: "string" }] },
  "llInsertString": { name: "llInsertString", returnType: "string", delay: 0, status: "normal", params: [{ name: "dst", type: "string" }, { name: "position", type: "integer" }, { name: "src", type: "string" }] },
  "llInstantMessage": { name: "llInstantMessage", returnType: "void", delay: 2, status: "normal", params: [{ name: "user", type: "key" }, { name: "message", type: "string" }] },
  "llIntegerToBase64": { name: "llIntegerToBase64", returnType: "string", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llIsFriend": { name: "llIsFriend", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }] },
  "llJson2List": { name: "llJson2List", returnType: "list", delay: 0, status: "normal", params: [{ name: "json", type: "string" }] },
  "llJsonGetValue": { name: "llJsonGetValue", returnType: "string", delay: 0, status: "normal", params: [{ name: "json", type: "string" }, { name: "specifiers", type: "list" }] },
  "llJsonSetValue": { name: "llJsonSetValue", returnType: "string", delay: 0, status: "normal", params: [{ name: "json", type: "string" }, { name: "specifiers", type: "list" }, { name: "value", type: "string" }] },
  "llJsonValueType": { name: "llJsonValueType", returnType: "string", delay: 0, status: "normal", params: [{ name: "json", type: "string" }, { name: "specifiers", type: "list" }] },
  "llKey2Name": { name: "llKey2Name", returnType: "string", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llKeyCountKeyValue": { name: "llKeyCountKeyValue", returnType: "key", delay: 0, status: "normal", params: [] },
  "llKeysKeyValue": { name: "llKeysKeyValue", returnType: "key", delay: 0, status: "normal", params: [{ name: "start", type: "integer" }, { name: "count", type: "integer" }] },
  "llLinear2sRGB": { name: "llLinear2sRGB", returnType: "vector", delay: 0, status: "normal", params: [{ name: "color", type: "vector" }] },
  "llLinkAdjustSoundVolume": { name: "llLinkAdjustSoundVolume", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "link", type: "integer" }, { name: "volume", type: "float" }] },
  "llLinkParticleSystem": { name: "llLinkParticleSystem", returnType: "void", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "rules", type: "list" }] },
  "llLinkPlaySound": { name: "llLinkPlaySound", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "sound", type: "string" }, { name: "volume", type: "float" }, { name: "flags", type: "integer" }] },
  "llLinkSetSoundQueueing": { name: "llLinkSetSoundQueueing", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "queue", type: "integer" }] },
  "llLinkSetSoundRadius": { name: "llLinkSetSoundRadius", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "radius", type: "float" }] },
  "llLinkSitTarget": { name: "llLinkSitTarget", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "offset", type: "vector" }, { name: "rot", type: "rotation" }] },
  "llLinkStopSound": { name: "llLinkStopSound", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }] },
  "llLinksetDataAvailable": { name: "llLinksetDataAvailable", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llLinksetDataCountFound": { name: "llLinksetDataCountFound", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pattern", type: "string" }] },
  "llLinksetDataCountKeys": { name: "llLinksetDataCountKeys", returnType: "integer", delay: 0, status: "normal", params: [] },
  "llLinksetDataDelete": { name: "llLinksetDataDelete", returnType: "integer", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llLinksetDataDeleteFound": { name: "llLinksetDataDeleteFound", returnType: "list", delay: 0, status: "normal", params: [{ name: "pattern", type: "string" }, { name: "pass", type: "string" }] },
  "llLinksetDataDeleteProtected": { name: "llLinksetDataDeleteProtected", returnType: "integer", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "password", type: "string" }] },
  "llLinksetDataFindKeys": { name: "llLinksetDataFindKeys", returnType: "list", delay: 0, status: "normal", params: [{ name: "pattern", type: "string" }, { name: "start", type: "integer" }, { name: "count", type: "integer" }] },
  "llLinksetDataListKeys": { name: "llLinksetDataListKeys", returnType: "list", delay: 0, status: "normal", params: [{ name: "start", type: "integer" }, { name: "count", type: "integer" }] },
  "llLinksetDataRead": { name: "llLinksetDataRead", returnType: "string", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llLinksetDataReadProtected": { name: "llLinksetDataReadProtected", returnType: "string", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "password", type: "string" }] },
  "llLinksetDataReset": { name: "llLinksetDataReset", returnType: "void", delay: 0, status: "normal", params: [] },
  "llLinksetDataWrite": { name: "llLinksetDataWrite", returnType: "integer", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "value", type: "string" }] },
  "llLinksetDataWriteProtected": { name: "llLinksetDataWriteProtected", returnType: "integer", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "value", type: "string" }, { name: "password", type: "string" }] },
  "llList2CSV": { name: "llList2CSV", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "list" }] },
  "llList2Float": { name: "llList2Float", returnType: "float", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llList2Integer": { name: "llList2Integer", returnType: "integer", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llList2Json": { name: "llList2Json", returnType: "string", delay: 0, status: "normal", params: [{ name: "type", type: "string" }, { name: "values", type: "list" }] },
  "llList2Key": { name: "llList2Key", returnType: "key", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llList2List": { name: "llList2List", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }] },
  "llList2ListSlice": { name: "llList2ListSlice", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }, { name: "stride", type: "integer" }, { name: "slice_index", type: "integer" }] },
  "llList2ListStrided": { name: "llList2ListStrided", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }, { name: "stride", type: "integer" }] },
  "llList2Rot": { name: "llList2Rot", returnType: "rotation", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llList2String": { name: "llList2String", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llList2Vector": { name: "llList2Vector", returnType: "vector", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "index", type: "integer" }] },
  "llListFindList": { name: "llListFindList", returnType: "integer", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "test", type: "list" }] },
  "llListFindListNext": { name: "llListFindListNext", returnType: "integer", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "test", type: "list" }, { name: "n", type: "integer" }] },
  "llListFindStrided": { name: "llListFindStrided", returnType: "integer", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "test", type: "list" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }, { name: "stride", type: "integer" }] },
  "llListInsertList": { name: "llListInsertList", returnType: "list", delay: 0, status: "normal", params: [{ name: "dest", type: "list" }, { name: "src", type: "list" }, { name: "start", type: "integer" }] },
  "llListRandomize": { name: "llListRandomize", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "stride", type: "integer" }] },
  "llListReplaceList": { name: "llListReplaceList", returnType: "list", delay: 0, status: "normal", params: [{ name: "dest", type: "list" }, { name: "src", type: "list" }, { name: "start", type: "integer" }, { name: "end", type: "integer" }] },
  "llListSort": { name: "llListSort", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "stride", type: "integer" }, { name: "ascending", type: "integer" }] },
  "llListSortStrided": { name: "llListSortStrided", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "list" }, { name: "stride", type: "integer" }, { name: "stride_index", type: "integer" }, { name: "ascending", type: "integer" }] },
  "llListStatistics": { name: "llListStatistics", returnType: "float", delay: 0, status: "normal", params: [{ name: "operation", type: "integer" }, { name: "src", type: "list" }] },
  "llListen": { name: "llListen", returnType: "integer", delay: 0, status: "normal", params: [{ name: "channel", type: "integer" }, { name: "name", type: "string" }, { name: "id", type: "key" }, { name: "msg", type: "string" }] },
  "llListenControl": { name: "llListenControl", returnType: "void", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }, { name: "active", type: "integer" }] },
  "llListenRemove": { name: "llListenRemove", returnType: "void", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llLoadURL": { name: "llLoadURL", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "avatar", type: "key" }, { name: "message", type: "string" }, { name: "url", type: "string" }] },
  "llLog": { name: "llLog", returnType: "float", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llLog10": { name: "llLog10", returnType: "float", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llLookAt": { name: "llLookAt", returnType: "void", delay: 0, status: "normal", params: [{ name: "target", type: "vector" }, { name: "strength", type: "float" }, { name: "damping", type: "float" }] },
  "llLoopSound": { name: "llLoopSound", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }] },
  "llLoopSoundMaster": { name: "llLoopSoundMaster", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }] },
  "llLoopSoundSlave": { name: "llLoopSoundSlave", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }] },
  "llMD5String": { name: "llMD5String", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "nonce", type: "integer" }] },
  "llMakeExplosion": { name: "llMakeExplosion", returnType: "void", delay: 0.1, status: "deprecated", params: [{ name: "particles", type: "integer" }, { name: "scale", type: "float" }, { name: "vel", type: "float" }, { name: "lifetime", type: "float" }, { name: "arc", type: "float" }, { name: "texture", type: "string" }, { name: "offset", type: "vector" }] },
  "llMakeFire": { name: "llMakeFire", returnType: "void", delay: 0.1, status: "deprecated", params: [{ name: "particles", type: "integer" }, { name: "scale", type: "float" }, { name: "vel", type: "float" }, { name: "lifetime", type: "float" }, { name: "arc", type: "float" }, { name: "texture", type: "string" }, { name: "offset", type: "vector" }] },
  "llMakeFountain": { name: "llMakeFountain", returnType: "void", delay: 0.1, status: "deprecated", params: [{ name: "particles", type: "integer" }, { name: "scale", type: "float" }, { name: "vel", type: "float" }, { name: "lifetime", type: "float" }, { name: "arc", type: "float" }, { name: "bounce", type: "integer" }, { name: "texture", type: "string" }, { name: "offset", type: "vector" }, { name: "bounce_offset", type: "float" }] },
  "llMakeSmoke": { name: "llMakeSmoke", returnType: "void", delay: 0.1, status: "deprecated", params: [{ name: "particles", type: "integer" }, { name: "scale", type: "float" }, { name: "vel", type: "float" }, { name: "lifetime", type: "float" }, { name: "arc", type: "float" }, { name: "texture", type: "string" }, { name: "offset", type: "vector" }] },
  "llManageEstateAccess": { name: "llManageEstateAccess", returnType: "integer", delay: 0, status: "normal", params: [{ name: "action", type: "integer" }, { name: "id", type: "key" }] },
  "llMapBeacon": { name: "llMapBeacon", returnType: "void", delay: 0, status: "normal", params: [{ name: "region", type: "string" }, { name: "position", type: "vector" }, { name: "options", type: "list" }] },
  "llMapDestination": { name: "llMapDestination", returnType: "void", delay: 1, status: "normal", params: [{ name: "simname", type: "string" }, { name: "pos", type: "vector" }, { name: "look_at", type: "vector" }] },
  "llMessageLinked": { name: "llMessageLinked", returnType: "void", delay: 0, status: "normal", params: [{ name: "linknum", type: "integer" }, { name: "num", type: "integer" }, { name: "str", type: "string" }, { name: "id", type: "key" }] },
  "llMinEventDelay": { name: "llMinEventDelay", returnType: "void", delay: 0, status: "normal", params: [{ name: "delay", type: "float" }] },
  "llModPow": { name: "llModPow", returnType: "integer", delay: 1, status: "normal", params: [{ name: "a", type: "integer" }, { name: "b", type: "integer" }, { name: "c", type: "integer" }] },
  "llModifyLand": { name: "llModifyLand", returnType: "void", delay: 0, status: "normal", params: [{ name: "action", type: "integer" }, { name: "brush", type: "integer" }] },
  "llMoveToTarget": { name: "llMoveToTarget", returnType: "void", delay: 0, status: "normal", params: [{ name: "target", type: "vector" }, { name: "tau", type: "float" }] },
  "llName2Key": { name: "llName2Key", returnType: "key", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llNavigateTo": { name: "llNavigateTo", returnType: "void", delay: 0, status: "normal", params: [{ name: "point", type: "vector" }, { name: "options", type: "list" }] },
  "llOffsetTexture": { name: "llOffsetTexture", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "u", type: "float" }, { name: "v", type: "float" }, { name: "face", type: "integer" }] },
  "llOpenFloater": { name: "llOpenFloater", returnType: "integer", delay: 0, status: "godmode", params: [{ name: "floater_name", type: "string" }, { name: "url", type: "string" }, { name: "params", type: "list" }] },
  "llOpenRemoteDataChannel": { name: "llOpenRemoteDataChannel", returnType: "void", delay: 1, status: "deprecated", params: [] },
  "llOrd": { name: "llOrd", returnType: "integer", delay: 0, status: "normal", params: [{ name: "val", type: "string" }, { name: "index", type: "integer" }] },
  "llOverMyLand": { name: "llOverMyLand", returnType: "integer", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llOwnerSay": { name: "llOwnerSay", returnType: "void", delay: 0, status: "normal", params: [{ name: "msg", type: "string" }] },
  "llParcelMediaCommandList": { name: "llParcelMediaCommandList", returnType: "void", delay: 2, status: "normal", params: [{ name: "command", type: "list" }] },
  "llParcelMediaQuery": { name: "llParcelMediaQuery", returnType: "list", delay: 2, status: "normal", params: [{ name: "query", type: "list" }] },
  "llParseString2List": { name: "llParseString2List", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "separators", type: "list" }, { name: "spacers", type: "list" }] },
  "llParseStringKeepNulls": { name: "llParseStringKeepNulls", returnType: "list", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "separators", type: "list" }, { name: "spacers", type: "list" }] },
  "llParticleSystem": { name: "llParticleSystem", returnType: "void", delay: 0, status: "normal", params: [{ name: "rules", type: "list" }] },
  "llPassCollisions": { name: "llPassCollisions", returnType: "void", delay: 0, status: "normal", params: [{ name: "pass", type: "integer" }] },
  "llPassTouches": { name: "llPassTouches", returnType: "void", delay: 0, status: "normal", params: [{ name: "pass", type: "integer" }] },
  "llPatrolPoints": { name: "llPatrolPoints", returnType: "void", delay: 0, status: "normal", params: [{ name: "points", type: "list" }, { name: "options", type: "list" }] },
  "llPlaySound": { name: "llPlaySound", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }] },
  "llPlaySoundSlave": { name: "llPlaySoundSlave", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }] },
  "llPointAt": { name: "llPointAt", returnType: "void", delay: 0, status: "unimplemented", params: [{ name: "pos", type: "vector" }] },
  "llPow": { name: "llPow", returnType: "float", delay: 0, status: "normal", params: [{ name: "base", type: "float" }, { name: "exponent", type: "float" }] },
  "llPreloadSound": { name: "llPreloadSound", returnType: "void", delay: 1, status: "normal", params: [{ name: "sound", type: "string" }] },
  "llPursue": { name: "llPursue", returnType: "void", delay: 0, status: "normal", params: [{ name: "target", type: "key" }, { name: "options", type: "list" }] },
  "llPushObject": { name: "llPushObject", returnType: "void", delay: 0, status: "normal", params: [{ name: "id", type: "key" }, { name: "impulse", type: "vector" }, { name: "ang_impulse", type: "vector" }, { name: "local", type: "integer" }] },
  "llReadKeyValue": { name: "llReadKeyValue", returnType: "key", delay: 0, status: "normal", params: [{ name: "k", type: "string" }] },
  "llRefreshPrimURL": { name: "llRefreshPrimURL", returnType: "void", delay: 20, status: "unimplemented", params: [] },
  "llRegionSay": { name: "llRegionSay", returnType: "void", delay: 0, status: "normal", params: [{ name: "channel", type: "integer" }, { name: "msg", type: "string" }] },
  "llRegionSayTo": { name: "llRegionSayTo", returnType: "void", delay: 0, status: "normal", params: [{ name: "target", type: "key" }, { name: "channel", type: "integer" }, { name: "msg", type: "string" }] },
  "llReleaseCamera": { name: "llReleaseCamera", returnType: "void", delay: 0, status: "unimplemented", params: [{ name: "avatar", type: "key" }] },
  "llReleaseControls": { name: "llReleaseControls", returnType: "void", delay: 0, status: "normal", params: [] },
  "llReleaseURL": { name: "llReleaseURL", returnType: "void", delay: 0, status: "normal", params: [{ name: "url", type: "string" }] },
  "llRemoteDataReply": { name: "llRemoteDataReply", returnType: "void", delay: 3, status: "deprecated", params: [{ name: "channel", type: "key" }, { name: "message_id", type: "key" }, { name: "sdata", type: "string" }, { name: "idata", type: "integer" }] },
  "llRemoteDataSetRegion": { name: "llRemoteDataSetRegion", returnType: "void", delay: 0, status: "deprecated", params: [] },
  "llRemoteLoadScript": { name: "llRemoteLoadScript", returnType: "void", delay: 3, status: "unimplemented", params: [{ name: "target", type: "key" }, { name: "name", type: "string" }, { name: "running", type: "integer" }, { name: "start_param", type: "integer" }] },
  "llRemoteLoadScriptPin": { name: "llRemoteLoadScriptPin", returnType: "void", delay: 3, status: "normal", params: [{ name: "target", type: "key" }, { name: "name", type: "string" }, { name: "pin", type: "integer" }, { name: "running", type: "integer" }, { name: "start_param", type: "integer" }] },
  "llRemoveFromLandBanList": { name: "llRemoveFromLandBanList", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "avatar", type: "key" }] },
  "llRemoveFromLandPassList": { name: "llRemoveFromLandPassList", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "avatar", type: "key" }] },
  "llRemoveInventory": { name: "llRemoveInventory", returnType: "void", delay: 0, status: "normal", params: [{ name: "item", type: "string" }] },
  "llRemoveVehicleFlags": { name: "llRemoveVehicleFlags", returnType: "void", delay: 0, status: "normal", params: [{ name: "flags", type: "integer" }] },
  "llReplaceAgentEnvironment": { name: "llReplaceAgentEnvironment", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent_id", type: "key" }, { name: "transition", type: "float" }, { name: "environment", type: "string" }] },
  "llReplaceEnvironment": { name: "llReplaceEnvironment", returnType: "integer", delay: 0, status: "normal", params: [{ name: "position", type: "vector" }, { name: "environment", type: "string" }, { name: "track_no", type: "integer" }, { name: "day_length", type: "integer" }, { name: "day_offset", type: "integer" }] },
  "llReplaceSubString": { name: "llReplaceSubString", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "pattern", type: "string" }, { name: "replacement_pattern", type: "string" }, { name: "count", type: "integer" }] },
  "llRequestAgentData": { name: "llRequestAgentData", returnType: "key", delay: 0.1, status: "normal", params: [{ name: "id", type: "key" }, { name: "data", type: "integer" }] },
  "llRequestDisplayName": { name: "llRequestDisplayName", returnType: "key", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llRequestExperiencePermissions": { name: "llRequestExperiencePermissions", returnType: "void", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }, { name: "name", type: "string" }] },
  "llRequestInventoryData": { name: "llRequestInventoryData", returnType: "key", delay: 1, status: "normal", params: [{ name: "name", type: "string" }] },
  "llRequestPermissions": { name: "llRequestPermissions", returnType: "void", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }, { name: "perm", type: "integer" }] },
  "llRequestSecureURL": { name: "llRequestSecureURL", returnType: "key", delay: 0, status: "normal", params: [] },
  "llRequestSimulatorData": { name: "llRequestSimulatorData", returnType: "key", delay: 1, status: "normal", params: [{ name: "simulator", type: "string" }, { name: "data", type: "integer" }] },
  "llRequestURL": { name: "llRequestURL", returnType: "key", delay: 0, status: "normal", params: [] },
  "llRequestUserKey": { name: "llRequestUserKey", returnType: "key", delay: 0, status: "normal", params: [{ name: "username", type: "string" }] },
  "llRequestUsername": { name: "llRequestUsername", returnType: "key", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llResetAnimationOverride": { name: "llResetAnimationOverride", returnType: "void", delay: 0, status: "normal", params: [{ name: "anim_state", type: "string" }] },
  "llResetLandBanList": { name: "llResetLandBanList", returnType: "void", delay: 0.1, status: "normal", params: [] },
  "llResetLandPassList": { name: "llResetLandPassList", returnType: "void", delay: 0.1, status: "normal", params: [] },
  "llResetOtherScript": { name: "llResetOtherScript", returnType: "void", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llResetScript": { name: "llResetScript", returnType: "void", delay: 0, status: "normal", params: [] },
  "llResetTime": { name: "llResetTime", returnType: "void", delay: 0, status: "normal", params: [] },
  "llReturnObjectsByID": { name: "llReturnObjectsByID", returnType: "integer", delay: 0, status: "normal", params: [{ name: "objects", type: "list" }] },
  "llReturnObjectsByOwner": { name: "llReturnObjectsByOwner", returnType: "integer", delay: 0, status: "normal", params: [{ name: "owner", type: "key" }, { name: "scope", type: "integer" }] },
  "llRezAtRoot": { name: "llRezAtRoot", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "inventory", type: "string" }, { name: "pos", type: "vector" }, { name: "vel", type: "vector" }, { name: "rot", type: "rotation" }, { name: "param", type: "integer" }] },
  "llRezObject": { name: "llRezObject", returnType: "void", delay: 0.1, status: "normal", params: [{ name: "inventory", type: "string" }, { name: "pos", type: "vector" }, { name: "vel", type: "vector" }, { name: "rot", type: "rotation" }, { name: "param", type: "integer" }] },
  "llRezObjectWithParams": { name: "llRezObjectWithParams", returnType: "key", delay: 0, status: "normal", params: [{ name: "itemname", type: "string" }, { name: "params", type: "list" }] },
  "llRot2Angle": { name: "llRot2Angle", returnType: "float", delay: 0, status: "normal", params: [{ name: "rot", type: "rotation" }] },
  "llRot2Axis": { name: "llRot2Axis", returnType: "vector", delay: 0, status: "normal", params: [{ name: "rot", type: "rotation" }] },
  "llRot2Euler": { name: "llRot2Euler", returnType: "vector", delay: 0, status: "normal", params: [{ name: "q", type: "rotation" }] },
  "llRot2Fwd": { name: "llRot2Fwd", returnType: "vector", delay: 0, status: "normal", params: [{ name: "q", type: "rotation" }] },
  "llRot2Left": { name: "llRot2Left", returnType: "vector", delay: 0, status: "normal", params: [{ name: "q", type: "rotation" }] },
  "llRot2Up": { name: "llRot2Up", returnType: "vector", delay: 0, status: "normal", params: [{ name: "q", type: "rotation" }] },
  "llRotBetween": { name: "llRotBetween", returnType: "rotation", delay: 0, status: "normal", params: [{ name: "v1", type: "vector" }, { name: "v2", type: "vector" }] },
  "llRotLookAt": { name: "llRotLookAt", returnType: "void", delay: 0, status: "normal", params: [{ name: "target", type: "rotation" }, { name: "strength", type: "float" }, { name: "damping", type: "float" }] },
  "llRotTarget": { name: "llRotTarget", returnType: "integer", delay: 0, status: "normal", params: [{ name: "rot", type: "rotation" }, { name: "error", type: "float" }] },
  "llRotTargetRemove": { name: "llRotTargetRemove", returnType: "void", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llRotateTexture": { name: "llRotateTexture", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "angle", type: "float" }, { name: "face", type: "integer" }] },
  "llRound": { name: "llRound", returnType: "integer", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llSHA1String": { name: "llSHA1String", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }] },
  "llSHA256String": { name: "llSHA256String", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }] },
  "llSameGroup": { name: "llSameGroup", returnType: "integer", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llSay": { name: "llSay", returnType: "void", delay: 0, status: "normal", params: [{ name: "channel", type: "integer" }, { name: "msg", type: "string" }] },
  "llScaleByFactor": { name: "llScaleByFactor", returnType: "integer", delay: 0, status: "normal", params: [{ name: "scaling_factor", type: "float" }] },
  "llScaleTexture": { name: "llScaleTexture", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "u", type: "float" }, { name: "v", type: "float" }, { name: "face", type: "integer" }] },
  "llScriptDanger": { name: "llScriptDanger", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llScriptProfiler": { name: "llScriptProfiler", returnType: "void", delay: 0, status: "normal", params: [{ name: "flags", type: "integer" }] },
  "llSendRemoteData": { name: "llSendRemoteData", returnType: "key", delay: 3, status: "deprecated", params: [{ name: "channel", type: "key" }, { name: "dest", type: "string" }, { name: "idata", type: "integer" }, { name: "sdata", type: "string" }] },
  "llSensor": { name: "llSensor", returnType: "void", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "id", type: "key" }, { name: "type", type: "integer" }, { name: "range", type: "float" }, { name: "arc", type: "float" }] },
  "llSensorRemove": { name: "llSensorRemove", returnType: "void", delay: 0, status: "normal", params: [] },
  "llSensorRepeat": { name: "llSensorRepeat", returnType: "void", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "id", type: "key" }, { name: "type", type: "integer" }, { name: "range", type: "float" }, { name: "arc", type: "float" }, { name: "rate", type: "float" }] },
  "llSetAgentEnvironment": { name: "llSetAgentEnvironment", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent_id", type: "key" }, { name: "transition", type: "float" }, { name: "params", type: "list" }] },
  "llSetAgentRot": { name: "llSetAgentRot", returnType: "void", delay: 0, status: "normal", params: [{ name: "orientation", type: "rotation" }, { name: "flags", type: "integer" }] },
  "llSetAlpha": { name: "llSetAlpha", returnType: "void", delay: 0, status: "normal", params: [{ name: "alpha", type: "float" }, { name: "face", type: "integer" }] },
  "llSetAngularVelocity": { name: "llSetAngularVelocity", returnType: "void", delay: 0, status: "normal", params: [{ name: "angular_velocity", type: "vector" }, { name: "local", type: "integer" }] },
  "llSetAnimationOverride": { name: "llSetAnimationOverride", returnType: "void", delay: 0, status: "normal", params: [{ name: "anim_state", type: "string" }, { name: "anim", type: "string" }] },
  "llSetBuoyancy": { name: "llSetBuoyancy", returnType: "void", delay: 0, status: "normal", params: [{ name: "buoyancy", type: "float" }] },
  "llSetCameraAtOffset": { name: "llSetCameraAtOffset", returnType: "void", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llSetCameraEyeOffset": { name: "llSetCameraEyeOffset", returnType: "void", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llSetCameraParams": { name: "llSetCameraParams", returnType: "void", delay: 0, status: "normal", params: [{ name: "rules", type: "list" }] },
  "llSetClickAction": { name: "llSetClickAction", returnType: "void", delay: 0, status: "normal", params: [{ name: "action", type: "integer" }] },
  "llSetColor": { name: "llSetColor", returnType: "void", delay: 0, status: "normal", params: [{ name: "color", type: "vector" }, { name: "face", type: "integer" }] },
  "llSetContentType": { name: "llSetContentType", returnType: "void", delay: 0, status: "normal", params: [{ name: "request_id", type: "key" }, { name: "content_type", type: "integer" }] },
  "llSetDamage": { name: "llSetDamage", returnType: "void", delay: 0, status: "normal", params: [{ name: "damage", type: "float" }] },
  "llSetEnvironment": { name: "llSetEnvironment", returnType: "integer", delay: 0, status: "normal", params: [{ name: "position", type: "vector" }, { name: "params", type: "list" }] },
  "llSetForce": { name: "llSetForce", returnType: "void", delay: 0, status: "normal", params: [{ name: "force", type: "vector" }, { name: "local", type: "integer" }] },
  "llSetForceAndTorque": { name: "llSetForceAndTorque", returnType: "void", delay: 0, status: "normal", params: [{ name: "force", type: "vector" }, { name: "torque", type: "vector" }, { name: "local", type: "integer" }] },
  "llSetHoverHeight": { name: "llSetHoverHeight", returnType: "void", delay: 0, status: "normal", params: [{ name: "height", type: "float" }, { name: "water", type: "integer" }, { name: "tau", type: "float" }] },
  "llSetInventoryPermMask": { name: "llSetInventoryPermMask", returnType: "void", delay: 0, status: "godmode", params: [{ name: "item", type: "string" }, { name: "mask", type: "integer" }, { name: "value", type: "integer" }] },
  "llSetKeyframedMotion": { name: "llSetKeyframedMotion", returnType: "void", delay: 0, status: "normal", params: [{ name: "keyframes", type: "list" }, { name: "options", type: "list" }] },
  "llSetLinkAlpha": { name: "llSetLinkAlpha", returnType: "void", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "alpha", type: "float" }, { name: "face", type: "integer" }] },
  "llSetLinkCamera": { name: "llSetLinkCamera", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "eye", type: "vector" }, { name: "at", type: "vector" }] },
  "llSetLinkColor": { name: "llSetLinkColor", returnType: "void", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "color", type: "vector" }, { name: "face", type: "integer" }] },
  "llSetLinkMedia": { name: "llSetLinkMedia", returnType: "integer", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "face", type: "integer" }, { name: "params", type: "list" }] },
  "llSetLinkPrimitiveParams": { name: "llSetLinkPrimitiveParams", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "rules", type: "list" }] },
  "llSetLinkPrimitiveParamsFast": { name: "llSetLinkPrimitiveParamsFast", returnType: "void", delay: 0, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "rules", type: "list" }] },
  "llSetLinkRenderMaterial": { name: "llSetLinkRenderMaterial", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "material", type: "string" }, { name: "face", type: "integer" }] },
  "llSetLinkSitFlags": { name: "llSetLinkSitFlags", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "flags", type: "integer" }] },
  "llSetLinkTexture": { name: "llSetLinkTexture", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "linknumber", type: "integer" }, { name: "texture", type: "string" }, { name: "face", type: "integer" }] },
  "llSetLinkTextureAnim": { name: "llSetLinkTextureAnim", returnType: "void", delay: 0, status: "normal", params: [{ name: "link", type: "integer" }, { name: "mode", type: "integer" }, { name: "face", type: "integer" }, { name: "sizex", type: "integer" }, { name: "sizey", type: "integer" }, { name: "start", type: "float" }, { name: "length", type: "float" }, { name: "rate", type: "float" }] },
  "llSetLocalRot": { name: "llSetLocalRot", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "rot", type: "rotation" }] },
  "llSetMemoryLimit": { name: "llSetMemoryLimit", returnType: "integer", delay: 0, status: "normal", params: [{ name: "limit", type: "integer" }] },
  "llSetObjectDesc": { name: "llSetObjectDesc", returnType: "void", delay: 0, status: "normal", params: [{ name: "desc", type: "string" }] },
  "llSetObjectName": { name: "llSetObjectName", returnType: "void", delay: 0, status: "normal", params: [{ name: "name", type: "string" }] },
  "llSetObjectPermMask": { name: "llSetObjectPermMask", returnType: "void", delay: 0, status: "godmode", params: [{ name: "mask", type: "integer" }, { name: "value", type: "integer" }] },
  "llSetParcelMusicURL": { name: "llSetParcelMusicURL", returnType: "void", delay: 2, status: "normal", params: [{ name: "url", type: "string" }] },
  "llSetPayPrice": { name: "llSetPayPrice", returnType: "void", delay: 0, status: "normal", params: [{ name: "price", type: "integer" }, { name: "quick_pay_buttons", type: "list" }] },
  "llSetPhysicsMaterial": { name: "llSetPhysicsMaterial", returnType: "void", delay: 0, status: "normal", params: [{ name: "flags", type: "integer" }, { name: "gravity_multiplier", type: "float" }, { name: "restitution", type: "float" }, { name: "friction", type: "float" }, { name: "density", type: "float" }] },
  "llSetPos": { name: "llSetPos", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llSetPrimMediaParams": { name: "llSetPrimMediaParams", returnType: "integer", delay: 1, status: "normal", params: [{ name: "face", type: "integer" }, { name: "params", type: "list" }] },
  "llSetPrimURL": { name: "llSetPrimURL", returnType: "void", delay: 20, status: "unimplemented", params: [{ name: "url", type: "string" }] },
  "llSetPrimitiveParams": { name: "llSetPrimitiveParams", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "rules", type: "list" }] },
  "llSetRegionPos": { name: "llSetRegionPos", returnType: "integer", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llSetRemoteScriptAccessPin": { name: "llSetRemoteScriptAccessPin", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "pin", type: "integer" }] },
  "llSetRenderMaterial": { name: "llSetRenderMaterial", returnType: "void", delay: 0, status: "normal", params: [{ name: "material", type: "string" }, { name: "face", type: "integer" }] },
  "llSetRot": { name: "llSetRot", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "rot", type: "rotation" }] },
  "llSetScale": { name: "llSetScale", returnType: "void", delay: 0, status: "normal", params: [{ name: "scale", type: "vector" }] },
  "llSetScriptState": { name: "llSetScriptState", returnType: "void", delay: 0, status: "normal", params: [{ name: "name", type: "string" }, { name: "run", type: "integer" }] },
  "llSetSitText": { name: "llSetSitText", returnType: "void", delay: 0, status: "normal", params: [{ name: "text", type: "string" }] },
  "llSetSoundQueueing": { name: "llSetSoundQueueing", returnType: "void", delay: 0, status: "normal", params: [{ name: "queue", type: "integer" }] },
  "llSetSoundRadius": { name: "llSetSoundRadius", returnType: "void", delay: 0, status: "normal", params: [{ name: "radius", type: "float" }] },
  "llSetStatus": { name: "llSetStatus", returnType: "void", delay: 0, status: "normal", params: [{ name: "status", type: "integer" }, { name: "value", type: "integer" }] },
  "llSetText": { name: "llSetText", returnType: "void", delay: 0, status: "normal", params: [{ name: "text", type: "string" }, { name: "color", type: "vector" }, { name: "alpha", type: "float" }] },
  "llSetTexture": { name: "llSetTexture", returnType: "void", delay: 0.2, status: "normal", params: [{ name: "texture", type: "string" }, { name: "face", type: "integer" }] },
  "llSetTextureAnim": { name: "llSetTextureAnim", returnType: "void", delay: 0, status: "normal", params: [{ name: "mode", type: "integer" }, { name: "face", type: "integer" }, { name: "sizex", type: "integer" }, { name: "sizey", type: "integer" }, { name: "start", type: "float" }, { name: "length", type: "float" }, { name: "rate", type: "float" }] },
  "llSetTimerEvent": { name: "llSetTimerEvent", returnType: "void", delay: 0, status: "normal", params: [{ name: "sec", type: "float" }] },
  "llSetTorque": { name: "llSetTorque", returnType: "void", delay: 0, status: "normal", params: [{ name: "torque", type: "vector" }, { name: "local", type: "integer" }] },
  "llSetTouchText": { name: "llSetTouchText", returnType: "void", delay: 0, status: "normal", params: [{ name: "text", type: "string" }] },
  "llSetVehicleFlags": { name: "llSetVehicleFlags", returnType: "void", delay: 0, status: "normal", params: [{ name: "flags", type: "integer" }] },
  "llSetVehicleFloatParam": { name: "llSetVehicleFloatParam", returnType: "void", delay: 0, status: "normal", params: [{ name: "param", type: "integer" }, { name: "value", type: "float" }] },
  "llSetVehicleRotationParam": { name: "llSetVehicleRotationParam", returnType: "void", delay: 0, status: "normal", params: [{ name: "param", type: "integer" }, { name: "rot", type: "rotation" }] },
  "llSetVehicleType": { name: "llSetVehicleType", returnType: "void", delay: 0, status: "normal", params: [{ name: "type", type: "integer" }] },
  "llSetVehicleVectorParam": { name: "llSetVehicleVectorParam", returnType: "void", delay: 0, status: "normal", params: [{ name: "param", type: "integer" }, { name: "vec", type: "vector" }] },
  "llSetVelocity": { name: "llSetVelocity", returnType: "void", delay: 0, status: "normal", params: [{ name: "velocity", type: "vector" }, { name: "local", type: "integer" }] },
  "llShout": { name: "llShout", returnType: "void", delay: 0, status: "normal", params: [{ name: "channel", type: "integer" }, { name: "msg", type: "string" }] },
  "llSignRSA": { name: "llSignRSA", returnType: "string", delay: 0, status: "normal", params: [{ name: "private_key", type: "string" }, { name: "msg", type: "string" }, { name: "algorithm", type: "string" }] },
  "llSin": { name: "llSin", returnType: "float", delay: 0, status: "normal", params: [{ name: "theta", type: "float" }] },
  "llSitOnLink": { name: "llSitOnLink", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent_id", type: "key" }, { name: "link", type: "integer" }] },
  "llSitTarget": { name: "llSitTarget", returnType: "void", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }, { name: "rot", type: "rotation" }] },
  "llSleep": { name: "llSleep", returnType: "void", delay: 0, status: "normal", params: [{ name: "sec", type: "float" }] },
  "llSound": { name: "llSound", returnType: "void", delay: 0, status: "deprecated", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }, { name: "queue", type: "integer" }, { name: "loop", type: "integer" }] },
  "llSoundPreload": { name: "llSoundPreload", returnType: "void", delay: 0, status: "deprecated", params: [{ name: "sound", type: "string" }] },
  "llSqrt": { name: "llSqrt", returnType: "float", delay: 0, status: "normal", params: [{ name: "val", type: "float" }] },
  "llStartAnimation": { name: "llStartAnimation", returnType: "void", delay: 0, status: "normal", params: [{ name: "anim", type: "string" }] },
  "llStartObjectAnimation": { name: "llStartObjectAnimation", returnType: "void", delay: 0, status: "normal", params: [{ name: "anim", type: "string" }] },
  "llStopAnimation": { name: "llStopAnimation", returnType: "void", delay: 0, status: "normal", params: [{ name: "anim", type: "string" }] },
  "llStopHover": { name: "llStopHover", returnType: "void", delay: 0, status: "normal", params: [] },
  "llStopLookAt": { name: "llStopLookAt", returnType: "void", delay: 0, status: "normal", params: [] },
  "llStopMoveToTarget": { name: "llStopMoveToTarget", returnType: "void", delay: 0, status: "normal", params: [] },
  "llStopObjectAnimation": { name: "llStopObjectAnimation", returnType: "void", delay: 0, status: "normal", params: [{ name: "anim", type: "string" }] },
  "llStopPointAt": { name: "llStopPointAt", returnType: "void", delay: 0, status: "unimplemented", params: [] },
  "llStopSound": { name: "llStopSound", returnType: "void", delay: 0, status: "normal", params: [] },
  "llStringLength": { name: "llStringLength", returnType: "integer", delay: 0, status: "normal", params: [{ name: "str", type: "string" }] },
  "llStringToBase64": { name: "llStringToBase64", returnType: "string", delay: 0, status: "normal", params: [{ name: "str", type: "string" }] },
  "llStringTrim": { name: "llStringTrim", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }, { name: "trim_type", type: "integer" }] },
  "llSubStringIndex": { name: "llSubStringIndex", returnType: "integer", delay: 0, status: "normal", params: [{ name: "source", type: "string" }, { name: "pattern", type: "string" }] },
  "llTakeCamera": { name: "llTakeCamera", returnType: "void", delay: 0, status: "unimplemented", params: [{ name: "avatar", type: "key" }] },
  "llTakeControls": { name: "llTakeControls", returnType: "void", delay: 0, status: "normal", params: [{ name: "controls", type: "integer" }, { name: "accept", type: "integer" }, { name: "pass_on", type: "integer" }] },
  "llTan": { name: "llTan", returnType: "float", delay: 0, status: "normal", params: [{ name: "theta", type: "float" }] },
  "llTarget": { name: "llTarget", returnType: "integer", delay: 0, status: "normal", params: [{ name: "position", type: "vector" }, { name: "range", type: "float" }] },
  "llTargetOmega": { name: "llTargetOmega", returnType: "void", delay: 0, status: "normal", params: [{ name: "axis", type: "vector" }, { name: "spinrate", type: "float" }, { name: "gain", type: "float" }] },
  "llTargetRemove": { name: "llTargetRemove", returnType: "void", delay: 0, status: "normal", params: [{ name: "number", type: "integer" }] },
  "llTargetedEmail": { name: "llTargetedEmail", returnType: "void", delay: 20, status: "normal", params: [{ name: "target", type: "integer" }, { name: "subject", type: "string" }, { name: "message", type: "string" }] },
  "llTeleportAgent": { name: "llTeleportAgent", returnType: "void", delay: 0, status: "normal", params: [{ name: "avatar", type: "key" }, { name: "landmark", type: "string" }, { name: "position", type: "vector" }, { name: "look_at", type: "vector" }] },
  "llTeleportAgentGlobalCoords": { name: "llTeleportAgentGlobalCoords", returnType: "void", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }, { name: "global_coordinates", type: "vector" }, { name: "region_coordinates", type: "vector" }, { name: "look_at", type: "vector" }] },
  "llTeleportAgentHome": { name: "llTeleportAgentHome", returnType: "void", delay: 5, status: "normal", params: [{ name: "id", type: "key" }] },
  "llTextBox": { name: "llTextBox", returnType: "void", delay: 1, status: "normal", params: [{ name: "avatar", type: "key" }, { name: "message", type: "string" }, { name: "chat_channel", type: "integer" }] },
  "llToLower": { name: "llToLower", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }] },
  "llToUpper": { name: "llToUpper", returnType: "string", delay: 0, status: "normal", params: [{ name: "src", type: "string" }] },
  "llTransferLindenDollars": { name: "llTransferLindenDollars", returnType: "key", delay: 0, status: "normal", params: [{ name: "destination", type: "key" }, { name: "amount", type: "integer" }] },
  "llTransferOwnership": { name: "llTransferOwnership", returnType: "integer", delay: 0, status: "normal", params: [{ name: "agent", type: "key" }, { name: "flags", type: "integer" }, { name: "options", type: "list" }] },
  "llTriggerSound": { name: "llTriggerSound", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }] },
  "llTriggerSoundLimited": { name: "llTriggerSoundLimited", returnType: "void", delay: 0, status: "normal", params: [{ name: "sound", type: "string" }, { name: "volume", type: "float" }, { name: "top_north_east", type: "vector" }, { name: "bottom_south_west", type: "vector" }] },
  "llUnSit": { name: "llUnSit", returnType: "void", delay: 0, status: "normal", params: [{ name: "id", type: "key" }] },
  "llUnescapeURL": { name: "llUnescapeURL", returnType: "string", delay: 0, status: "normal", params: [{ name: "url", type: "string" }] },
  "llUpdateCharacter": { name: "llUpdateCharacter", returnType: "void", delay: 0, status: "normal", params: [{ name: "options", type: "list" }] },
  "llUpdateKeyValue": { name: "llUpdateKeyValue", returnType: "key", delay: 0, status: "normal", params: [{ name: "k", type: "string" }, { name: "v", type: "string" }, { name: "checked", type: "integer" }, { name: "original_value", type: "string" }] },
  "llVecDist": { name: "llVecDist", returnType: "float", delay: 0, status: "normal", params: [{ name: "v1", type: "vector" }, { name: "v2", type: "vector" }] },
  "llVecMag": { name: "llVecMag", returnType: "float", delay: 0, status: "normal", params: [{ name: "v", type: "vector" }] },
  "llVecNorm": { name: "llVecNorm", returnType: "vector", delay: 0, status: "normal", params: [{ name: "v", type: "vector" }] },
  "llVerifyRSA": { name: "llVerifyRSA", returnType: "integer", delay: 0, status: "normal", params: [{ name: "public_key", type: "string" }, { name: "msg", type: "string" }, { name: "signature", type: "string" }, { name: "algorithm", type: "string" }] },
  "llVolumeDetect": { name: "llVolumeDetect", returnType: "void", delay: 0, status: "normal", params: [{ name: "detect", type: "integer" }] },
  "llWanderWithin": { name: "llWanderWithin", returnType: "void", delay: 0, status: "normal", params: [{ name: "center", type: "vector" }, { name: "radius", type: "vector" }, { name: "options", type: "list" }] },
  "llWater": { name: "llWater", returnType: "float", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llWhisper": { name: "llWhisper", returnType: "void", delay: 0, status: "normal", params: [{ name: "channel", type: "integer" }, { name: "msg", type: "string" }] },
  "llWind": { name: "llWind", returnType: "vector", delay: 0, status: "normal", params: [{ name: "offset", type: "vector" }] },
  "llWorldPosToHUD": { name: "llWorldPosToHUD", returnType: "vector", delay: 0, status: "normal", params: [{ name: "pos", type: "vector" }] },
  "llXorBase64": { name: "llXorBase64", returnType: "string", delay: 0, status: "normal", params: [{ name: "str1", type: "string" }, { name: "str2", type: "string" }] },
  "llXorBase64Strings": { name: "llXorBase64Strings", returnType: "string", delay: 0.3, status: "deprecated", params: [{ name: "str1", type: "string" }, { name: "str2", type: "string" }] },
  "llXorBase64StringsCorrect": { name: "llXorBase64StringsCorrect", returnType: "string", delay: 0, status: "deprecated", params: [{ name: "str1", type: "string" }, { name: "str2", type: "string" }] },
  "llsRGB2Linear": { name: "llsRGB2Linear", returnType: "vector", delay: 0, status: "normal", params: [{ name: "srgb", type: "vector" }] }
};

// packages/vm/dist/builtins/chat.js
var llSay = (ctx, args) => {
  const channel = args[0] ?? 0;
  const text = args[1] ?? "";
  ctx.state.chat.push({ channel, text, type: "say" });
  return void 0;
};
var llShout = (ctx, args) => {
  ctx.state.chat.push({
    channel: args[0] ?? 0,
    text: args[1] ?? "",
    type: "shout"
  });
  return void 0;
};
var llWhisper = (ctx, args) => {
  ctx.state.chat.push({
    channel: args[0] ?? 0,
    text: args[1] ?? "",
    type: "whisper"
  });
  return void 0;
};
var llOwnerSay = (ctx, args) => {
  ctx.state.chat.push({
    channel: PUBLIC_CHANNEL,
    text: args[0] ?? "",
    type: "ownerSay"
  });
  return void 0;
};

// packages/vm/dist/builtins/time.js
var llSetTimerEvent = (ctx, args) => {
  const seconds = args[0] ?? 0;
  ctx.state.clock.setTimer(seconds * 1e3);
  return void 0;
};
var FRAME_MS = 1e3 / 45;
var llSleep = (ctx, args) => {
  const seconds = args[0] ?? 0;
  if (seconds <= 0)
    return void 0;
  const ms = Math.max(FRAME_MS, seconds * 1e3);
  ctx.state.clock.advance(ms);
  return void 0;
};
var llGetTime = (ctx) => {
  return ctx.state.clock.elapsedSeconds();
};
var llGetAndResetTime = (ctx) => {
  const elapsed = ctx.state.clock.elapsedSeconds();
  ctx.state.clock.resetReference();
  return elapsed;
};
var llResetTime = (ctx) => {
  ctx.state.clock.resetReference();
  return void 0;
};

// packages/vm/dist/builtins/http.js
function nextHttpKey(state) {
  state.httpKeyCounter += 1;
  return `http-req-${String(state.httpKeyCounter).padStart(8, "0")}`;
}
function parseOptions(raw) {
  const out = {
    method: "GET",
    mimetype: "text/plain;charset=utf-8",
    headers: []
  };
  let i = 0;
  while (i < raw.length) {
    const code = raw[i];
    if (typeof code !== "number") {
      i++;
      continue;
    }
    switch (code) {
      case HTTP_METHOD: {
        const v = raw[i + 1];
        if (typeof v === "string")
          out.method = v;
        i += 2;
        break;
      }
      case HTTP_MIMETYPE: {
        const v = raw[i + 1];
        if (typeof v === "string")
          out.mimetype = v;
        i += 2;
        break;
      }
      case HTTP_CUSTOM_HEADER: {
        const name = raw[i + 1];
        const value = raw[i + 2];
        if (typeof name === "string" && typeof value === "string") {
          out.headers.push([name, value]);
        }
        i += 3;
        break;
      }
      default:
        i += 2;
        break;
    }
  }
  return out;
}
var llHTTPRequest = (ctx, args) => {
  const url = args[0] ?? "";
  const rawOptions = args[1] ?? [];
  const body = args[2] ?? "";
  const parsed = parseOptions(rawOptions);
  const key = nextHttpKey(ctx.state);
  ctx.state.httpRequests.push({
    key,
    url,
    method: parsed.method,
    body,
    mimetype: parsed.mimetype,
    headers: parsed.headers,
    rawOptions,
    fulfilled: false
  });
  return key;
};
var llHTTPResponse = () => {
  return void 0;
};

// packages/vm/dist/builtins/listen.js
function nextListenHandle(state) {
  state.listenHandleCounter += 1;
  return state.listenHandleCounter;
}
var llListen = (ctx, args) => {
  const channel = args[0] ?? 0;
  const name = args[1] ?? "";
  const id = args[2] ?? NULL_KEY;
  const msg = args[3] ?? "";
  const handle = nextListenHandle(ctx.state);
  ctx.state.listens.push({
    handle,
    channel,
    name,
    key: id,
    message: msg,
    active: true
  });
  return handle;
};
var llListenRemove = (ctx, args) => {
  const handle = args[0] ?? 0;
  const i = ctx.state.listens.findIndex((l) => l.handle === handle);
  if (i >= 0)
    ctx.state.listens.splice(i, 1);
  return void 0;
};
var llListenControl = (ctx, args) => {
  const handle = args[0] ?? 0;
  const active = (args[1] ?? 0) !== 0;
  const entry2 = ctx.state.listens.find((l) => l.handle === handle);
  if (entry2)
    entry2.active = active;
  return void 0;
};

// packages/vm/dist/builtins/math.js
var llAbs = (_ctx, args) => {
  return Math.abs(args[0] ?? 0) | 0;
};
var llFabs = (_ctx, args) => {
  return Math.abs(args[0] ?? 0);
};
var llRound = (_ctx, args) => {
  const x = args[0] ?? 0;
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5)
    return floor | 0;
  if (diff > 0.5)
    return floor + 1 | 0;
  return (floor % 2 === 0 ? floor : floor + 1) | 0;
};
var llCeil = (_ctx, args) => Math.ceil(args[0] ?? 0) | 0;
var llFloor = (_ctx, args) => Math.floor(args[0] ?? 0) | 0;
var llPow = (_ctx, args) => Math.pow(args[0] ?? 0, args[1] ?? 0);
var llSqrt = (_ctx, args) => Math.sqrt(args[0] ?? 0);
var llSin = (_ctx, args) => Math.sin(args[0] ?? 0);
var llCos = (_ctx, args) => Math.cos(args[0] ?? 0);
var llTan = (_ctx, args) => Math.tan(args[0] ?? 0);
var llAsin = (_ctx, args) => Math.asin(args[0] ?? 0);
var llAcos = (_ctx, args) => Math.acos(args[0] ?? 0);
var llAtan2 = (_ctx, args) => Math.atan2(args[0] ?? 0, args[1] ?? 0);
var llLog = (_ctx, args) => Math.log(args[0] ?? 0);
var llLog10 = (_ctx, args) => Math.log10(args[0] ?? 0);
var llFrand = (ctx, args) => {
  const mag = args[0] ?? 0;
  return ctx.state.random.next() * mag;
};
var llVecMag = (_ctx, args) => {
  const v = args[0];
  if (!v || typeof v !== "object" || !isVector(v))
    return 0;
  const u = v;
  return Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z);
};
var llVecNorm = (_ctx, args) => {
  const v = args[0];
  if (!v || typeof v !== "object" || !isVector(v))
    return { x: 0, y: 0, z: 0 };
  const u = v;
  const m = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z);
  if (m === 0)
    return { x: 0, y: 0, z: 0 };
  return { x: u.x / m, y: u.y / m, z: u.z / m };
};
var llVecDist = (_ctx, args) => {
  const a = args[0];
  const b = args[1];
  if (!a || !b)
    return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
var llRot2Euler = (_ctx, args) => {
  const q = args[0];
  if (!q)
    return { x: 0, y: 0, z: 0 };
  const sinr_cosp = 2 * (q.s * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = Math.atan2(sinr_cosp, cosr_cosp);
  const sinp = 2 * (q.s * q.y - q.z * q.x);
  const y = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  const siny_cosp = 2 * (q.s * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = Math.atan2(siny_cosp, cosy_cosp);
  return { x, y, z };
};
var llEuler2Rot = (_ctx, args) => {
  const v = args[0];
  if (!v)
    return { x: 0, y: 0, z: 0, s: 1 };
  const cy = Math.cos(v.z * 0.5);
  const sy = Math.sin(v.z * 0.5);
  const cp = Math.cos(v.y * 0.5);
  const sp = Math.sin(v.y * 0.5);
  const cr = Math.cos(v.x * 0.5);
  const sr = Math.sin(v.x * 0.5);
  return {
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    s: cr * cp * cy + sr * sp * sy
  };
};

// packages/vm/dist/builtins/strings.js
var llStringLength = (_ctx, args) => {
  const s = args[0] ?? "";
  return [...s].length;
};
var llSubStringIndex = (_ctx, args) => {
  const src = args[0] ?? "";
  const pat = args[1] ?? "";
  return src.indexOf(pat);
};
var llGetSubString = (_ctx, args) => {
  const src = args[0] ?? "";
  const start = args[1] ?? 0;
  const end = args[2] ?? 0;
  return sliceLslString(src, start, end);
};
var llDeleteSubString = (_ctx, args) => {
  const src = args[0] ?? "";
  const start = args[1] ?? 0;
  const end = args[2] ?? 0;
  return deleteLslSubString(src, start, end);
};
var llInsertString = (_ctx, args) => {
  const src = args[0] ?? "";
  const pos = args[1] ?? 0;
  const text = args[2] ?? "";
  const safe = clampInsertPos(src, pos);
  return src.slice(0, safe) + text + src.slice(safe);
};
var llStringTrim = (_ctx, args) => {
  const src = args[0] ?? "";
  const flags = args[1] ?? 0;
  let s = src;
  if (flags & STRING_TRIM_HEAD)
    s = s.replace(/^\s+/, "");
  if (flags & STRING_TRIM_TAIL)
    s = s.replace(/\s+$/, "");
  return s;
};
var llToLower = (_ctx, args) => (args[0] ?? "").toLowerCase();
var llToUpper = (_ctx, args) => (args[0] ?? "").toUpperCase();
var llReplaceSubString = (_ctx, args) => {
  const src = args[0] ?? "";
  const pattern = args[1] ?? "";
  const replacement = args[2] ?? "";
  const count = args[3] ?? 0;
  if (!pattern)
    return src;
  if (count === 0)
    return src.split(pattern).join(replacement);
  let out = src;
  if (count > 0) {
    let remaining = count;
    let result2 = "";
    let rest = out;
    while (remaining > 0) {
      const idx = rest.indexOf(pattern);
      if (idx < 0)
        break;
      result2 += rest.slice(0, idx) + replacement;
      rest = rest.slice(idx + pattern.length);
      remaining--;
    }
    return result2 + rest;
  }
  let n = -count;
  let result = out;
  while (n > 0) {
    const idx = result.lastIndexOf(pattern);
    if (idx < 0)
      break;
    result = result.slice(0, idx) + replacement + result.slice(idx + pattern.length);
    n--;
  }
  return result;
};
var llEscapeURL = (_ctx, args) => encodeURIComponent(args[0] ?? "");
var llUnescapeURL = (_ctx, args) => {
  try {
    return decodeURIComponent(args[0] ?? "");
  } catch {
    return "";
  }
};
function normalizeIndex(i, length) {
  return i < 0 ? Math.max(0, length + i) : Math.min(length - 1, i);
}
function sliceLslString(src, start, end) {
  const len = src.length;
  if (len === 0)
    return "";
  const a = normalizeIndex(start, len);
  const b = normalizeIndex(end, len);
  if (a <= b)
    return src.slice(a, b + 1);
  return src.slice(0, b + 1) + src.slice(a);
}
function deleteLslSubString(src, start, end) {
  const len = src.length;
  if (len === 0)
    return src;
  const a = normalizeIndex(start, len);
  const b = normalizeIndex(end, len);
  if (a <= b)
    return src.slice(0, a) + src.slice(b + 1);
  return src.slice(b + 1, a);
}
function clampInsertPos(src, pos) {
  if (pos < 0)
    return 0;
  if (pos > src.length)
    return src.length;
  return pos;
}

// packages/vm/dist/values/format.js
function formatFloat(n) {
  if (Number.isNaN(n))
    return "nan";
  if (!Number.isFinite(n))
    return n > 0 ? "inf" : "-inf";
  return n.toFixed(6);
}
function formatVector(v) {
  return `<${formatFloat(v.x)}, ${formatFloat(v.y)}, ${formatFloat(v.z)}>`;
}
function formatRotation(r) {
  return `<${formatFloat(r.x)}, ${formatFloat(r.y)}, ${formatFloat(r.z)}, ${formatFloat(r.s)}>`;
}
function formatListElement(v) {
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v | 0) : formatFloat(v);
  }
  if (typeof v === "string")
    return v;
  if (isVector(v))
    return formatVector(v);
  if (isRotation(v))
    return formatRotation(v);
  if (Array.isArray(v))
    return v.map(formatListElement).join("");
  return String(v);
}
function formatList(list) {
  return list.map(formatListElement).join("");
}

// packages/vm/dist/builtins/lists.js
var llGetListLength = (_ctx, args) => {
  const l = args[0];
  return (l?.length ?? 0) | 0;
};
function resolveIndex(idx, len) {
  if (idx < 0)
    idx = len + idx;
  if (idx < 0 || idx >= len)
    return -1;
  return idx;
}
var llList2Integer = (_ctx, args) => {
  const l = args[0];
  if (!l)
    return 0;
  const i = resolveIndex(args[1] ?? 0, l.length);
  if (i < 0)
    return 0;
  const v = l[i];
  if (typeof v === "number")
    return toInt32(Math.trunc(v));
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? 0 : toInt32(n);
  }
  return 0;
};
var llList2Float = (_ctx, args) => {
  const l = args[0];
  if (!l)
    return 0;
  const i = resolveIndex(args[1] ?? 0, l.length);
  if (i < 0)
    return 0;
  const v = l[i];
  if (typeof v === "number")
    return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
};
var llList2String = (_ctx, args) => {
  const l = args[0];
  if (!l)
    return "";
  const i = resolveIndex(args[1] ?? 0, l.length);
  if (i < 0)
    return "";
  const v = l[i];
  if (typeof v === "string")
    return v;
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v | 0) : v.toFixed(6);
  if (Array.isArray(v))
    return formatList(v);
  if (isVector(v)) {
    const u = v;
    return `<${u.x.toFixed(6)}, ${u.y.toFixed(6)}, ${u.z.toFixed(6)}>`;
  }
  if (isRotation(v)) {
    const r = v;
    return `<${r.x.toFixed(6)}, ${r.y.toFixed(6)}, ${r.z.toFixed(6)}, ${r.s.toFixed(6)}>`;
  }
  return "";
};
var llList2Key = (_ctx, args) => {
  const l = args[0];
  if (!l)
    return NULL_KEY;
  const i = resolveIndex(args[1] ?? 0, l.length);
  if (i < 0)
    return NULL_KEY;
  const v = l[i];
  return typeof v === "string" ? v : NULL_KEY;
};
var llList2Vector = (_ctx, args) => {
  const l = args[0];
  if (!l)
    return ZERO_VECTOR;
  const i = resolveIndex(args[1] ?? 0, l.length);
  if (i < 0)
    return ZERO_VECTOR;
  const v = l[i];
  return isVector(v) ? v : ZERO_VECTOR;
};
var llList2Rot = (_ctx, args) => {
  const l = args[0];
  if (!l)
    return ZERO_ROTATION;
  const i = resolveIndex(args[1] ?? 0, l.length);
  if (i < 0)
    return ZERO_ROTATION;
  const v = l[i];
  return isRotation(v) ? v : ZERO_ROTATION;
};
var llList2List = (_ctx, args) => {
  const src = args[0];
  if (!src)
    return [];
  const len = src.length;
  if (len === 0)
    return [];
  let start = args[1] ?? 0;
  let end = args[2] ?? 0;
  if (start < 0)
    start = Math.max(0, len + start);
  else
    start = Math.min(len - 1, start);
  if (end < 0)
    end = Math.max(0, len + end);
  else
    end = Math.min(len - 1, end);
  if (start <= end)
    return src.slice(start, end + 1);
  return [...src.slice(0, end + 1), ...src.slice(start)];
};
var llDeleteSubList = (_ctx, args) => {
  const src = args[0];
  if (!src)
    return [];
  const len = src.length;
  let start = args[1] ?? 0;
  let end = args[2] ?? 0;
  if (start < 0)
    start = Math.max(0, len + start);
  else
    start = Math.min(len - 1, start);
  if (end < 0)
    end = Math.max(0, len + end);
  else
    end = Math.min(len - 1, end);
  if (start <= end)
    return [...src.slice(0, start), ...src.slice(end + 1)];
  return src.slice(end + 1, start);
};
var llListInsertList = (_ctx, args) => {
  const dst = args[0] ?? [];
  const src = args[1] ?? [];
  let pos = args[2] ?? 0;
  if (pos < 0)
    pos = Math.max(0, dst.length + pos);
  pos = Math.min(dst.length, pos);
  return [...dst.slice(0, pos), ...src, ...dst.slice(pos)];
};
var llListReplaceList = (_ctx, args) => {
  const dst = args[0] ?? [];
  const src = args[1] ?? [];
  const len = dst.length;
  let start = args[2] ?? 0;
  let end = args[3] ?? 0;
  if (start < 0)
    start = Math.max(0, len + start);
  else
    start = Math.min(len, start);
  if (end < 0)
    end = Math.max(0, len + end);
  else
    end = Math.min(len - 1, end);
  if (start <= end)
    return [...dst.slice(0, start), ...src, ...dst.slice(end + 1)];
  return [...src, ...dst.slice(end + 1, start)];
};
var llListFindList = (_ctx, args) => {
  const src = args[0] ?? [];
  const test = args[1] ?? [];
  if (test.length === 0)
    return 0;
  outer: for (let i = 0; i <= src.length - test.length; i++) {
    for (let j = 0; j < test.length; j++) {
      const a = src[i + j];
      const b = test[j];
      if (!lslElementsEqual(a, b))
        continue outer;
    }
    return i;
  }
  return -1;
};
function lslElementsEqual(a, b) {
  if (a === b)
    return true;
  if (typeof a === "object" && typeof b === "object" && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
var llDumpList2String = (_ctx, args) => {
  const list = args[0] ?? [];
  const sep = args[1] ?? "";
  return list.map((v) => {
    if (typeof v === "string")
      return v;
    if (typeof v === "number")
      return Number.isInteger(v) ? String(v | 0) : v.toFixed(6);
    if (Array.isArray(v))
      return formatList(v);
    if (isVector(v)) {
      const u = v;
      return `<${u.x.toFixed(6)}, ${u.y.toFixed(6)}, ${u.z.toFixed(6)}>`;
    }
    if (isRotation(v)) {
      const r = v;
      return `<${r.x.toFixed(6)}, ${r.y.toFixed(6)}, ${r.z.toFixed(6)}, ${r.s.toFixed(6)}>`;
    }
    return "";
  }).join(sep);
};
var llCSV2List = (_ctx, args) => {
  const s = args[0] ?? "";
  if (s === "")
    return [];
  return s.split(/,\s*/);
};
var llParseString2List = (_ctx, args) => {
  const src = args[0] ?? "";
  const seps = args[1] ?? [];
  const keep = args[2] ?? [];
  const allTokens = [...seps.filter((x) => typeof x === "string"), ...keep.filter((x) => typeof x === "string")];
  if (allTokens.length === 0)
    return src ? [src] : [];
  const out = [];
  let buffer = "";
  let i = 0;
  while (i < src.length) {
    const matched = allTokens.filter((t) => t.length > 0 && src.startsWith(t, i)).sort((a, b) => b.length - a.length)[0];
    if (matched) {
      if (buffer)
        out.push(buffer);
      buffer = "";
      if (keep.includes(matched))
        out.push(matched);
      i += matched.length;
    } else {
      buffer += src[i];
      i++;
    }
  }
  if (buffer)
    out.push(buffer);
  return out;
};

// packages/vm/dist/builtins/json.js
var SENTINEL_STRINGS = /* @__PURE__ */ new Set([
  JSON_INVALID,
  JSON_OBJECT,
  JSON_ARRAY,
  JSON_NUMBER,
  JSON_STRING,
  JSON_NULL,
  JSON_TRUE,
  JSON_FALSE,
  JSON_DELETE
]);
var Parser = class {
  src;
  i = 0;
  constructor(src) {
    this.src = src;
  }
  parseRoot() {
    this.ws();
    if (this.i >= this.src.length)
      return null;
    const v = this.parseValue();
    if (v === null)
      return null;
    this.ws();
    if (this.i !== this.src.length)
      return null;
    return v;
  }
  ws() {
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === " " || c === "	" || c === "\n" || c === "\r")
        this.i++;
      else
        break;
    }
  }
  parseValue() {
    this.ws();
    if (this.i >= this.src.length)
      return null;
    const c = this.src[this.i];
    if (c === "{")
      return this.parseObject();
    if (c === "[")
      return this.parseArray();
    if (c === '"')
      return this.parseString();
    if (c === "t" && this.src.startsWith("true", this.i)) {
      this.i += 4;
      return { t: "true" };
    }
    if (c === "f" && this.src.startsWith("false", this.i)) {
      this.i += 5;
      return { t: "false" };
    }
    if (c === "n" && this.src.startsWith("null", this.i)) {
      this.i += 4;
      return { t: "null" };
    }
    if (c === "-" || c >= "0" && c <= "9")
      return this.parseNumber();
    return null;
  }
  parseObject() {
    this.i++;
    const entries = [];
    this.ws();
    if (this.src[this.i] === "}") {
      this.i++;
      return { t: "obj", entries };
    }
    while (true) {
      this.ws();
      if (this.src[this.i] !== '"')
        return null;
      const k = this.parseString();
      if (k === null || k.t !== "str")
        return null;
      this.ws();
      if (this.src[this.i] !== ":")
        return null;
      this.i++;
      this.ws();
      const nc = this.src[this.i];
      let v;
      if (nc === "," || nc === "}") {
        v = { t: "empty" };
      } else {
        const parsed = this.parseValue();
        if (parsed === null)
          return null;
        v = parsed;
      }
      entries.push([k.v, v]);
      this.ws();
      if (this.src[this.i] === "}") {
        this.i++;
        return { t: "obj", entries };
      }
      if (this.src[this.i] === ",") {
        this.i++;
        this.ws();
        if (this.src[this.i] === "}") {
          this.i++;
          return { t: "obj", entries };
        }
        continue;
      }
      return null;
    }
  }
  parseArray() {
    this.i++;
    const items = [];
    this.ws();
    if (this.src[this.i] === "]") {
      this.i++;
      return { t: "arr", items };
    }
    while (true) {
      this.ws();
      const nc = this.src[this.i];
      let v;
      if (nc === "," || nc === "]") {
        v = { t: "empty" };
      } else {
        const parsed = this.parseValue();
        if (parsed === null)
          return null;
        v = parsed;
      }
      items.push(v);
      this.ws();
      if (this.src[this.i] === "]") {
        this.i++;
        return { t: "arr", items };
      }
      if (this.src[this.i] === ",") {
        this.i++;
        this.ws();
        if (this.src[this.i] === "]") {
          this.i++;
          return { t: "arr", items };
        }
        continue;
      }
      return null;
    }
  }
  parseString() {
    if (this.src[this.i] !== '"')
      return null;
    this.i++;
    let out = "";
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === '"') {
        this.i++;
        return { t: "str", v: out };
      }
      if (c === "\\") {
        this.i++;
        const e = this.src[this.i];
        if (e === void 0)
          return null;
        this.i++;
        if (e === '"')
          out += '"';
        else if (e === "\\")
          out += "\\";
        else if (e === "/")
          out += "/";
        else if (e === "n")
          out += "\n";
        else if (e === "t")
          out += "	";
        else if (e === "r")
          out += "\r";
        else if (e === "b")
          out += "\b";
        else if (e === "f")
          out += "\f";
        else if (e === "u") {
          const hex = this.src.slice(this.i, this.i + 4);
          if (hex.length !== 4 || !/^[0-9a-fA-F]+$/.test(hex))
            return null;
          this.i += 4;
          out += String.fromCharCode(parseInt(hex, 16));
        } else {
          out += e;
        }
      } else {
        out += c;
        this.i++;
      }
    }
    return null;
  }
  parseNumber() {
    const start = this.i;
    if (this.src[this.i] === "-")
      this.i++;
    const digitStart = this.i;
    while (this.i < this.src.length && this.src[this.i] >= "0" && this.src[this.i] <= "9") {
      this.i++;
    }
    if (this.i === digitStart)
      return null;
    if (this.src[this.i] === ".") {
      this.i++;
      while (this.i < this.src.length && this.src[this.i] >= "0" && this.src[this.i] <= "9") {
        this.i++;
      }
    }
    if (this.src[this.i] === "e" || this.src[this.i] === "E") {
      this.i++;
      if (this.src[this.i] === "+" || this.src[this.i] === "-")
        this.i++;
      const expStart = this.i;
      while (this.i < this.src.length && this.src[this.i] >= "0" && this.src[this.i] <= "9") {
        this.i++;
      }
      if (this.i === expStart)
        return null;
    }
    return { t: "num", raw: this.src.slice(start, this.i) };
  }
};
function parseJson(src) {
  return new Parser(src).parseRoot();
}
function escapeJsonString(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = c.charCodeAt(0);
    if (c === '"')
      out += '\\"';
    else if (c === "\\")
      out += "\\\\";
    else if (c === "\n")
      out += "\\n";
    else if (c === "\r")
      out += "\\r";
    else if (c === "	")
      out += "\\t";
    else if (c === "\b")
      out += "\\b";
    else if (c === "\f")
      out += "\\f";
    else if (code < 32)
      out += "\\u" + code.toString(16).padStart(4, "0");
    else
      out += c;
  }
  return out;
}
function printJson(n) {
  switch (n.t) {
    case "null":
      return "null";
    case "true":
      return "true";
    case "false":
      return "false";
    case "num":
      return n.raw;
    case "str":
      return '"' + escapeJsonString(n.v) + '"';
    case "arr":
      return "[" + n.items.map(printJson).join(",") + "]";
    case "obj":
      return "{" + n.entries.map(([k, v]) => '"' + escapeJsonString(k) + '":' + printJson(v)).join(",") + "}";
    case "empty":
      return "null";
  }
}
function walk(root, specs) {
  let cur = root;
  for (const spec of specs) {
    if (cur.t === "empty")
      return { kind: "null" };
    if (typeof spec === "string") {
      if (cur.t !== "obj")
        return { kind: "invalid" };
      let found = null;
      for (const [k, v] of cur.entries)
        if (k === spec)
          found = v;
      if (found === null)
        return { kind: "invalid" };
      cur = found;
    } else if (typeof spec === "number") {
      if (cur.t !== "arr")
        return { kind: "invalid" };
      const idx = Math.trunc(spec);
      if (idx < 0 || idx >= cur.items.length)
        return { kind: "invalid" };
      cur = cur.items[idx];
    } else {
      return { kind: "invalid" };
    }
  }
  if (cur.t === "empty")
    return { kind: "null" };
  return { kind: "node", node: cur };
}
function nodeToGetString(n) {
  switch (n.t) {
    case "null":
      return JSON_NULL;
    case "true":
      return JSON_TRUE;
    case "false":
      return JSON_FALSE;
    case "num":
      return n.raw;
    case "str":
      return n.v;
    case "arr":
    case "obj":
      return printJson(n);
    case "empty":
      return JSON_NULL;
  }
}
function nodeType(n) {
  switch (n.t) {
    case "null":
      return JSON_NULL;
    case "true":
      return JSON_TRUE;
    case "false":
      return JSON_FALSE;
    case "num":
      return JSON_NUMBER;
    case "str":
      return JSON_STRING;
    case "arr":
      return JSON_ARRAY;
    case "obj":
      return JSON_OBJECT;
    case "empty":
      return JSON_NULL;
  }
}
function valueToNode(value) {
  if (value === JSON_DELETE)
    return "delete";
  if (value === JSON_NULL)
    return { t: "null" };
  if (value === JSON_TRUE)
    return { t: "true" };
  if (value === JSON_FALSE)
    return { t: "false" };
  const trimmed = value.trim();
  if (trimmed === "true")
    return { t: "true" };
  if (trimmed === "false")
    return { t: "false" };
  if (trimmed === "null")
    return { t: "null" };
  if (trimmed.length > 0) {
    const ch = trimmed[0];
    if (ch === "{" || ch === "[" || ch === '"' || ch === "-" || ch >= "0" && ch <= "9") {
      const parsed = parseJson(trimmed);
      if (parsed !== null)
        return parsed;
    }
  }
  return { t: "str", v: value };
}
function collapseDuplicateKeys(entries) {
  const seen = /* @__PURE__ */ new Set();
  const reversed = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const [k, v] = entries[i];
    if (!seen.has(k)) {
      seen.add(k);
      reversed.push([k, v]);
    }
  }
  return reversed.reverse();
}
function setIn(root, specs, value) {
  if (specs.length === 0) {
    if (value === "delete")
      return { ok: false };
    return { ok: true, node: value };
  }
  const head = specs[0];
  const rest = specs.slice(1);
  if (typeof head === "number") {
    const idx = Math.trunc(head);
    const arr = root && root.t === "arr" ? { t: "arr", items: [...root.items] } : { t: "arr", items: [] };
    if (idx === JSON_APPEND) {
      if (rest.length === 0) {
        if (value === "delete")
          return { ok: false };
        arr.items.push(value);
        return { ok: true, node: arr };
      }
      const sub2 = setIn(null, rest, value);
      if (!sub2.ok)
        return { ok: false };
      arr.items.push(sub2.node);
      return { ok: true, node: arr };
    }
    if (idx < 0)
      return { ok: false };
    if (idx > arr.items.length)
      return { ok: false };
    if (idx === arr.items.length) {
      if (rest.length === 0) {
        if (value === "delete")
          return { ok: true, node: arr };
        arr.items.push(value);
        return { ok: true, node: arr };
      }
      const sub2 = setIn(null, rest, value);
      if (!sub2.ok)
        return { ok: false };
      arr.items.push(sub2.node);
      return { ok: true, node: arr };
    }
    if (rest.length === 0) {
      if (value === "delete") {
        return { ok: false };
      }
      arr.items[idx] = value;
      return { ok: true, node: arr };
    }
    const sub = setIn(arr.items[idx], rest, value);
    if (!sub.ok)
      return { ok: false };
    arr.items[idx] = sub.node;
    return { ok: true, node: arr };
  }
  if (typeof head === "string") {
    const obj = root && root.t === "obj" ? { t: "obj", entries: collapseDuplicateKeys(root.entries) } : { t: "obj", entries: [] };
    const existingIdx = obj.entries.findIndex(([k]) => k === head);
    if (rest.length === 0) {
      if (value === "delete") {
        if (existingIdx >= 0)
          obj.entries.splice(existingIdx, 1);
        return { ok: true, node: obj };
      }
      if (existingIdx >= 0)
        obj.entries[existingIdx] = [head, value];
      else
        obj.entries.push([head, value]);
      return { ok: true, node: obj };
    }
    const existing = existingIdx >= 0 ? obj.entries[existingIdx][1] : null;
    const sub = setIn(existing, rest, value);
    if (!sub.ok)
      return { ok: false };
    if (existingIdx >= 0)
      obj.entries[existingIdx] = [head, sub.node];
    else
      obj.entries.push([head, sub.node]);
    return { ok: true, node: obj };
  }
  return { ok: false };
}
function jsonNodeToLslListItem(n) {
  if (n.t === "arr" || n.t === "obj")
    return printJson(n);
  switch (n.t) {
    case "null":
      return JSON_NULL;
    case "true":
      return JSON_TRUE;
    case "false":
      return JSON_FALSE;
    case "num":
      if (/^-?\d+$/.test(n.raw)) {
        const x = Number(n.raw);
        if (Number.isFinite(x))
          return x | 0;
      }
      return Number(n.raw);
    case "str":
      return n.v;
    case "empty":
      return JSON_NULL;
  }
}
var llJson2List = (_ctx, args) => {
  const src = args[0] ?? "";
  if (src === "")
    return [];
  const root = parseJson(src);
  if (root === null)
    return [src];
  if (root.t === "arr")
    return root.items.map(jsonNodeToLslListItem);
  if (root.t === "obj") {
    const out = [];
    for (const [k, v] of root.entries) {
      out.push(k, jsonNodeToLslListItem(v));
    }
    return out;
  }
  return [jsonNodeToLslListItem(root)];
};
var llJsonGetValue = (_ctx, args) => {
  const json = args[0] ?? "";
  const specs = args[1] ?? [];
  if (json === "")
    return JSON_INVALID;
  if (SENTINEL_STRINGS.has(json))
    return JSON_INVALID;
  const root = parseJson(json);
  if (root === null)
    return JSON_INVALID;
  const r = walk(root, specs);
  if (r.kind === "invalid")
    return JSON_INVALID;
  if (r.kind === "null")
    return JSON_NULL;
  return nodeToGetString(r.node);
};
var llJsonValueType = (_ctx, args) => {
  const json = args[0] ?? "";
  const specs = args[1] ?? [];
  if (json === "")
    return JSON_INVALID;
  if (SENTINEL_STRINGS.has(json))
    return JSON_INVALID;
  const root = parseJson(json);
  if (root === null)
    return JSON_INVALID;
  const r = walk(root, specs);
  if (r.kind === "invalid")
    return JSON_INVALID;
  if (r.kind === "null")
    return JSON_NULL;
  return nodeType(r.node);
};
var llJsonSetValue = (_ctx, args) => {
  const json = args[0] ?? "";
  const specs = args[1] ?? [];
  const value = args[2] ?? "";
  const root = json === "" || SENTINEL_STRINGS.has(json) ? null : parseJson(json);
  const valueNode = valueToNode(value);
  const r = setIn(root, specs, valueNode);
  if (!r.ok)
    return JSON_INVALID;
  return printJson(r.node);
};
function lslStringToJsonElement(raw) {
  const trimmed = raw.trim();
  if (trimmed === JSON_TRUE)
    return "true";
  if (trimmed === JSON_FALSE)
    return "false";
  if (trimmed === JSON_NULL)
    return "null";
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed;
  }
  if (trimmed === "true" || trimmed === "false" || trimmed === "null") {
    return trimmed;
  }
  if (trimmed.length > 0) {
    const ch = trimmed[0];
    if (ch === "{" || ch === "[" || ch === "-" || ch >= "0" && ch <= "9") {
      const parsed = parseJson(trimmed);
      if (parsed !== null)
        return trimmed;
    }
  }
  return '"' + escapeJsonString(trimmed) + '"';
}
function lslValueToJsonElement(v) {
  if (typeof v === "number") {
    if (!Number.isFinite(v))
      return null;
    if (Number.isInteger(v))
      return String(v | 0);
    return v.toFixed(6);
  }
  if (typeof v === "string")
    return lslStringToJsonElement(v);
  if (Array.isArray(v)) {
    const parts = v.map(lslValueToJsonElement);
    if (parts.some((p) => p === null))
      return null;
    return "[" + parts.join(",") + "]";
  }
  if (isVector(v)) {
    const u = v;
    return '"<' + u.x.toFixed(5) + ", " + u.y.toFixed(5) + ", " + u.z.toFixed(5) + '>"';
  }
  if (isRotation(v)) {
    const r = v;
    return '"<' + r.x.toFixed(5) + ", " + r.y.toFixed(5) + ", " + r.z.toFixed(5) + ", " + r.s.toFixed(5) + '>"';
  }
  return null;
}
var llList2Json = (_ctx, args) => {
  const type = args[0] ?? "";
  const values = args[1] ?? [];
  if (type === JSON_ARRAY) {
    const parts = values.map(lslValueToJsonElement);
    if (parts.some((p) => p === null))
      return JSON_INVALID;
    return "[" + parts.join(",") + "]";
  }
  if (type === JSON_OBJECT) {
    if (values.length % 2 !== 0)
      return JSON_INVALID;
    const parts = [];
    for (let i = 0; i < values.length; i += 2) {
      const k = values[i];
      const v = values[i + 1];
      if (typeof k !== "string")
        return JSON_INVALID;
      const ve = lslValueToJsonElement(v);
      if (ve === null)
        return JSON_INVALID;
      parts.push('"' + escapeJsonString(k) + '":' + ve);
    }
    return "{" + parts.join(",") + "}";
  }
  return JSON_INVALID;
};

// packages/vm/dist/builtins/identity.js
var llGetOwner = (ctx) => ctx.state.identity.owner;
var llGetCreator = (ctx) => ctx.state.identity.owner;
var llGetKey = (ctx) => ctx.state.identity.objectKey;
var llGetObjectName = (ctx) => ctx.state.identity.objectName;
var llSetObjectName = (ctx, args) => {
  const name = args[0] ?? "";
  ctx.state.identity.objectName = name;
  return void 0;
};
var llGetScriptName = (ctx) => ctx.state.identity.scriptName;

// packages/vm/dist/clock.js
var LinksetClock = class {
  /** Virtual milliseconds since linkset construction. Strictly monotonic. */
  now = 0;
  queue = [];
  /** Schedule a one-shot event on `target`'s handler at virtual time `at`. */
  schedule(target, at, event, payload = {}) {
    this.queue.push({ at, target, event, payload });
  }
  /** Move the clock forward unconditionally; does not drain queues. */
  advance(ms) {
    if (ms < 0)
      throw new Error("cannot advance time backwards");
    this.now += ms;
  }
  /**
   * Pop and return the next due event (`at <= now`) considering all queued
   * one-shots and every script's recurring timer. Returns `null` when no
   * event is ready.
   *
   * Recurring timers fire once per script per interval; their next fire
   * timestamp is advanced by `at + interval` (not `now + interval`) so that
   * long advances catch up on every missed fire.
   */
  takeNextDue(scripts) {
    let bestIdx = -1;
    let bestAt = Infinity;
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i];
      if (e.at <= this.now && e.at < bestAt) {
        bestAt = e.at;
        bestIdx = i;
      }
    }
    let bestTimerScript = null;
    let bestTimerAt = Infinity;
    for (const s of scripts) {
      if (s.dead || !s.running)
        continue;
      const v = s.clockView;
      if (v.timerIntervalMs > 0 && v.timerNextFireMs <= this.now && v.timerNextFireMs < bestTimerAt) {
        bestTimerAt = v.timerNextFireMs;
        bestTimerScript = s;
      }
    }
    if (bestIdx === -1 && bestTimerScript === null)
      return null;
    if (bestTimerScript && bestTimerAt <= bestAt) {
      const at = bestTimerAt;
      const v = bestTimerScript.clockView;
      v.timerNextFireMs = at + v.timerIntervalMs;
      return { at, target: bestTimerScript, event: "timer", payload: {} };
    }
    const ev = this.queue[bestIdx];
    this.queue.splice(bestIdx, 1);
    return ev;
  }
  /** Snapshot of the pending one-shot queue. Read-only; for inspection/tests. */
  pendingEvents() {
    return this.queue.slice();
  }
  /** Remove every queued event whose target is `script`. Used on reset. */
  purgeTarget(script) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].target === script)
        this.queue.splice(i, 1);
    }
  }
};
var ScriptClockView = class {
  linksetClock;
  self;
  /** Reference time for `llGetTime`/`llResetTime` (virtual ms). */
  timeReferenceMs = 0;
  /** Recurring timer interval in ms; 0 = no timer. */
  timerIntervalMs = 0;
  /** Virtual time at which the next timer event fires. */
  timerNextFireMs = 0;
  constructor(linksetClock, self) {
    this.linksetClock = linksetClock;
    this.self = self;
  }
  get now() {
    return this.linksetClock.now;
  }
  /** Schedule a one-shot event on this script. */
  schedule(at, event, payload = {}) {
    this.linksetClock.schedule(this.self(), at, event, payload);
  }
  /** Schedule a one-shot event on a specific script. */
  scheduleOn(target, at, event, payload = {}) {
    this.linksetClock.schedule(target, at, event, payload);
  }
  cancelTimer() {
    this.timerIntervalMs = 0;
    this.timerNextFireMs = 0;
  }
  setTimer(intervalMs) {
    if (intervalMs <= 0) {
      this.cancelTimer();
      return;
    }
    this.timerIntervalMs = intervalMs;
    this.timerNextFireMs = this.now + intervalMs;
  }
  /** Advances the linkset clock — used by `llSleep`. */
  advance(ms) {
    this.linksetClock.advance(ms);
  }
  elapsedSeconds() {
    return (this.now - this.timeReferenceMs) / 1e3;
  }
  resetReference() {
    this.timeReferenceMs = this.now;
  }
};

// packages/vm/dist/inventory.js
var InventoryType = {
  TEXTURE: INVENTORY_TEXTURE,
  SOUND: INVENTORY_SOUND,
  LANDMARK: INVENTORY_LANDMARK,
  CLOTHING: INVENTORY_CLOTHING,
  OBJECT: INVENTORY_OBJECT,
  NOTECARD: INVENTORY_NOTECARD,
  SCRIPT: INVENTORY_SCRIPT,
  BODYPART: INVENTORY_BODYPART,
  ANIMATION: INVENTORY_ANIMATION,
  GESTURE: INVENTORY_GESTURE,
  MESH: 22,
  SETTING: INVENTORY_SETTING,
  MATERIAL: INVENTORY_MATERIAL
};
var DEFAULT_PERMS = {
  base: PERM_ALL,
  owner: PERM_ALL,
  group: 0,
  everyone: 0,
  next: PERM_ALL
};
function makeInventoryItem(partial) {
  const item = {
    name: partial.name,
    type: partial.type,
    key: partial.key ?? NULL_KEY,
    creator: partial.creator ?? NULL_KEY,
    description: partial.description ?? "",
    acquireTimeMs: partial.acquireTimeMs ?? 0,
    permMask: partial.permMask ?? DEFAULT_PERMS
  };
  if (partial.script !== void 0)
    item.script = partial.script;
  if (partial.notecardLines !== void 0)
    item.notecardLines = partial.notecardLines;
  return item;
}

// packages/vm/dist/prim-params.js
var SHAPE_BOX = PRIM_TYPE_BOX;
var SHAPE_CYLINDER = PRIM_TYPE_CYLINDER;
var SHAPE_PRISM = PRIM_TYPE_PRISM;
var SHAPE_SPHERE = PRIM_TYPE_SPHERE;
var SHAPE_TORUS = PRIM_TYPE_TORUS;
var SHAPE_TUBE = PRIM_TYPE_TUBE;
var SHAPE_RING = PRIM_TYPE_RING;
var SHAPE_SCULPT = PRIM_TYPE_SCULPT;
if (SHAPE_BOX !== 0 || SHAPE_CYLINDER !== 1 || SHAPE_PRISM !== 2 || SHAPE_SPHERE !== 3 || SHAPE_TORUS !== 4 || SHAPE_TUBE !== 5 || SHAPE_RING !== 6 || SHAPE_SCULPT !== 7) {
  throw new Error("kwdb PRIM_TYPE_* constants disagree with PrimShape literal aliases");
}
var zero = () => ({ x: 0, y: 0, z: 0 });
var one = () => ({ x: 1, y: 1, z: 1 });
var identityRot = () => ({ x: 0, y: 0, z: 0, s: 1 });
function defaultFaceMaterial() {
  return { texture: "", textureRepeats: { x: 1, y: 1, z: 0 }, textureOffsets: zero(), textureRotation: 0 };
}
function defaultFace() {
  return {
    texture: TEXTURE_DEFAULT,
    textureRepeats: { x: 1, y: 1, z: 0 },
    textureOffsets: zero(),
    textureRotation: 0,
    color: one(),
    alpha: 1,
    bumpShiny: { shiny: PRIM_SHINY_NONE, bump: PRIM_BUMP_NONE },
    fullBright: false,
    glow: 0,
    texgen: PRIM_TEXGEN_DEFAULT,
    renderMaterial: "",
    normal: defaultFaceMaterial(),
    specular: { ...defaultFaceMaterial(), color: one(), glossiness: 51, environment: 0 },
    alphaMode: { mode: PRIM_ALPHA_MODE_NONE, cutoff: 0 },
    gltf: {
      baseColor: { ...defaultFaceMaterial(), color: one(), alpha: 1, alphaMode: PRIM_GLTF_ALPHA_MODE_OPAQUE, alphaCutoff: 0.5, doubleSided: 0 },
      normal: defaultFaceMaterial(),
      metallicRoughness: { ...defaultFaceMaterial(), metallic: 1, roughness: 1 },
      emissive: { ...defaultFaceMaterial(), tint: zero() }
    }
  };
}
function defaultShape() {
  return {
    kind: SHAPE_BOX,
    hole: PRIM_HOLE_DEFAULT,
    cut: { x: 0, y: 1, z: 0 },
    hollow: 0,
    twist: zero(),
    topSize: { x: 1, y: 1, z: 0 },
    topShear: zero()
  };
}
function defaultPrimParams() {
  return {
    position: zero(),
    rotation: identityRot(),
    size: { x: 0.5, y: 0.5, z: 0.5 },
    faces: Array.from({ length: 6 }, () => defaultFace()),
    pointLight: { enabled: false, color: one(), intensity: 1, radius: 10, falloff: 0.75 },
    glow: [0, 0, 0, 0, 0, 0],
    omega: { axis: zero(), spinrate: 0, gain: 0 },
    physicsShapeType: PRIM_PHYSICS_SHAPE_PRIM,
    flexible: { enabled: false, softness: 0, gravity: 0, friction: 0, wind: 0, tension: 0, force: zero() },
    sculpt: { textureKey: "", type: PRIM_SCULPT_TYPE_SPHERE },
    slice: { x: 0, y: 1, z: 0 },
    shape: defaultShape(),
    material: PRIM_MATERIAL_STONE,
    tempOnRez: false,
    castShadows: false,
    allowUnsit: true,
    scriptedSitOnly: false,
    sitTarget: { enabled: false, offset: zero(), rotation: identityRot() },
    sitFlags: 0,
    projector: { texture: NULL_KEY, fov: 0, focus: 0, ambiance: 0 },
    clickAction: CLICK_ACTION_TOUCH,
    damage: { amount: 0, type: 0 },
    health: 1,
    reflectionProbe: { enabled: false, ambiance: 0, clipDistance: 0, flags: 0 },
    physicsMaterial: { gravityMultiplier: 1, restitution: 0, friction: 0, density: 1e3 },
    textureAnim: { mode: 0, face: 0, sizex: 0, sizey: 0, start: 0, length: 0, rate: 0 },
    passCollisions: 0,
    passTouches: 0
  };
}
var num = (v, d = 0) => typeof v === "number" ? v : d;
var str = (v, d = "") => typeof v === "string" ? v : d;
var asVec = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v) && "x" in v && "y" in v && "z" in v && !("s" in v)) {
    const w = v;
    return { x: w.x, y: w.y, z: w.z };
  }
  return zero();
};
var asRot = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v) && "s" in v) {
    const r = v;
    return { x: r.x, y: r.y, z: r.z, s: r.s };
  }
  return identityRot();
};
function facesOf(faceArg) {
  const f = num(faceArg, 0) | 0;
  if (f === ALL_SIDES)
    return [0, 1, 2, 3, 4, 5];
  return [f];
}
function inRange(face) {
  return face >= 0 && face <= 5;
}
function writePrimParamSlots(param, rules, cursor) {
  switch (param) {
    case PRIM_NAME:
    case PRIM_DESC:
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
    case PRIM_ROTATION:
    case PRIM_ROT_LOCAL:
    case PRIM_SIZE:
    case PRIM_SLICE:
    case PRIM_MATERIAL:
    case PRIM_PHYSICS:
    case PRIM_PHANTOM:
    case PRIM_TEMP_ON_REZ:
    case PRIM_PHYSICS_SHAPE_TYPE:
    case PRIM_CAST_SHADOWS:
    case PRIM_ALLOW_UNSIT:
    case PRIM_SCRIPTED_SIT_ONLY:
    case PRIM_SIT_FLAGS:
    case PRIM_CLICK_ACTION:
    case PRIM_HEALTH:
      return 1;
    case PRIM_DAMAGE:
      return 2;
    case PRIM_TEXT:
    case PRIM_OMEGA:
    case PRIM_SIT_TARGET:
      return 3;
    case PRIM_REFLECTION_PROBE:
    case PRIM_PROJECTOR:
      return 4;
    case PRIM_POINT_LIGHT:
      return 5;
    case PRIM_FLEXIBLE:
      return 7;
    case PRIM_TYPE: {
      const kind = num(rules[cursor]) | 0;
      if (kind === SHAPE_BOX || kind === SHAPE_CYLINDER || kind === SHAPE_PRISM)
        return 7;
      if (kind === SHAPE_SPHERE)
        return 6;
      if (kind === SHAPE_TORUS || kind === SHAPE_TUBE || kind === SHAPE_RING)
        return 12;
      if (kind === SHAPE_SCULPT)
        return 3;
      return null;
    }
    case PRIM_COLOR:
      return 3;
    case PRIM_TEXTURE:
    case PRIM_NORMAL:
    case PRIM_GLTF_NORMAL:
      return 5;
    case PRIM_RENDER_MATERIAL:
    case PRIM_FULLBRIGHT:
    case PRIM_GLOW:
    case PRIM_TEXGEN:
      return 2;
    case PRIM_BUMP_SHINY:
    case PRIM_ALPHA_MODE:
      return 3;
    case PRIM_SPECULAR:
      return 8;
    case PRIM_GLTF_BASE_COLOR:
      return 10;
    case PRIM_GLTF_METALLIC_ROUGHNESS:
      return 7;
    case PRIM_GLTF_EMISSIVE:
      return 6;
    case PRIM_LINK_TARGET:
      return null;
    // walker handles
    default:
      return null;
  }
}
function writePrimParam(prim, param, rules, cursor) {
  const p = prim.params;
  switch (param) {
    case PRIM_NAME:
      prim.name = str(rules[cursor]);
      return 1;
    case PRIM_DESC:
      prim.description = str(rules[cursor]);
      prim.appearance.description = prim.description;
      return 1;
    case PRIM_TEXT: {
      const text = str(rules[cursor]);
      const color = asVec(rules[cursor + 1]);
      const alpha = num(rules[cursor + 2], 1);
      prim.appearance.text = { text, color, alpha };
      return 3;
    }
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
      p.position = asVec(rules[cursor]);
      return 1;
    case PRIM_ROTATION:
    case PRIM_ROT_LOCAL:
      p.rotation = asRot(rules[cursor]);
      return 1;
    case PRIM_SIZE:
      p.size = asVec(rules[cursor]);
      return 1;
    case PRIM_SLICE:
      p.slice = asVec(rules[cursor]);
      return 1;
    case PRIM_MATERIAL:
      p.material = num(rules[cursor]) | 0;
      return 1;
    case PRIM_PHYSICS:
      prim.setStatus(STATUS_PHYSICS, num(rules[cursor]) !== 0);
      return 1;
    case PRIM_PHANTOM:
      prim.setStatus(STATUS_PHANTOM, num(rules[cursor]) !== 0);
      return 1;
    case PRIM_TEMP_ON_REZ:
      p.tempOnRez = num(rules[cursor]) !== 0;
      return 1;
    case PRIM_PHYSICS_SHAPE_TYPE:
      p.physicsShapeType = num(rules[cursor]) | 0;
      return 1;
    case PRIM_CAST_SHADOWS:
      p.castShadows = num(rules[cursor]) !== 0;
      return 1;
    case PRIM_ALLOW_UNSIT:
      p.allowUnsit = num(rules[cursor]) !== 0;
      return 1;
    case PRIM_SCRIPTED_SIT_ONLY:
      p.scriptedSitOnly = num(rules[cursor]) !== 0;
      return 1;
    case PRIM_SIT_FLAGS:
      p.sitFlags = num(rules[cursor]) | 0;
      return 1;
    case PRIM_CLICK_ACTION:
      p.clickAction = num(rules[cursor]) | 0;
      return 1;
    case PRIM_HEALTH:
      p.health = num(rules[cursor]);
      return 1;
    case PRIM_DAMAGE:
      p.damage = { amount: num(rules[cursor]), type: num(rules[cursor + 1]) | 0 };
      return 2;
    case PRIM_OMEGA:
      p.omega = { axis: asVec(rules[cursor]), spinrate: num(rules[cursor + 1]), gain: num(rules[cursor + 2]) };
      return 3;
    case PRIM_POINT_LIGHT:
      p.pointLight = {
        enabled: num(rules[cursor]) !== 0,
        color: asVec(rules[cursor + 1]),
        intensity: num(rules[cursor + 2]),
        radius: num(rules[cursor + 3]),
        falloff: num(rules[cursor + 4])
      };
      return 5;
    case PRIM_REFLECTION_PROBE:
      p.reflectionProbe = {
        enabled: num(rules[cursor]) !== 0,
        ambiance: num(rules[cursor + 1]),
        clipDistance: num(rules[cursor + 2]),
        flags: num(rules[cursor + 3]) | 0
      };
      return 4;
    case PRIM_PROJECTOR:
      p.projector = {
        texture: str(rules[cursor]),
        fov: num(rules[cursor + 1]),
        focus: num(rules[cursor + 2]),
        ambiance: num(rules[cursor + 3])
      };
      return 4;
    case PRIM_FLEXIBLE:
      p.flexible = {
        enabled: num(rules[cursor]) !== 0,
        softness: num(rules[cursor + 1]) | 0,
        gravity: num(rules[cursor + 2]),
        friction: num(rules[cursor + 3]),
        wind: num(rules[cursor + 4]),
        tension: num(rules[cursor + 5]),
        force: asVec(rules[cursor + 6])
      };
      return 7;
    case PRIM_SIT_TARGET:
      p.sitTarget = {
        enabled: num(rules[cursor]) !== 0,
        offset: asVec(rules[cursor + 1]),
        rotation: asRot(rules[cursor + 2])
      };
      return 3;
    case PRIM_TYPE:
      return writePrimType(p, rules, cursor);
    case PRIM_COLOR: {
      const faces = facesOf(rules[cursor]);
      const color = asVec(rules[cursor + 1]);
      const alpha = num(rules[cursor + 2], 1);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].color = { x: color.x, y: color.y, z: color.z };
        p.faces[f].alpha = alpha;
      }
      return 3;
    }
    case PRIM_TEXTURE: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].texture = tex;
        p.faces[f].textureRepeats = { x: repeats.x, y: repeats.y, z: repeats.z };
        p.faces[f].textureOffsets = { x: offsets.x, y: offsets.y, z: offsets.z };
        p.faces[f].textureRotation = rot2;
      }
      return 5;
    }
    case PRIM_RENDER_MATERIAL: {
      const faces = facesOf(rules[cursor]);
      const m = str(rules[cursor + 1]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].renderMaterial = m;
      }
      return 2;
    }
    case PRIM_FULLBRIGHT: {
      const faces = facesOf(rules[cursor]);
      const v = num(rules[cursor + 1]) !== 0;
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].fullBright = v;
      }
      return 2;
    }
    case PRIM_GLOW: {
      const faces = facesOf(rules[cursor]);
      const v = num(rules[cursor + 1]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].glow = v;
        p.glow[f] = v;
      }
      return 2;
    }
    case PRIM_BUMP_SHINY: {
      const faces = facesOf(rules[cursor]);
      const shiny = num(rules[cursor + 1]) | 0;
      const bump = num(rules[cursor + 2]) | 0;
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].bumpShiny = { shiny, bump };
      }
      return 3;
    }
    case PRIM_TEXGEN: {
      const faces = facesOf(rules[cursor]);
      const mode = num(rules[cursor + 1]) | 0;
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].texgen = mode;
      }
      return 2;
    }
    case PRIM_NORMAL: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].normal = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot2
        };
      }
      return 5;
    }
    case PRIM_SPECULAR: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      const color = asVec(rules[cursor + 5]);
      const gloss = num(rules[cursor + 6]) | 0;
      const env = num(rules[cursor + 7]) | 0;
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].specular = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot2,
          color: { x: color.x, y: color.y, z: color.z },
          glossiness: gloss,
          environment: env
        };
      }
      return 8;
    }
    case PRIM_ALPHA_MODE: {
      const faces = facesOf(rules[cursor]);
      const mode = num(rules[cursor + 1]) | 0;
      const cutoff = num(rules[cursor + 2]) | 0;
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].alphaMode = { mode, cutoff };
      }
      return 3;
    }
    case PRIM_GLTF_BASE_COLOR: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      const color = asVec(rules[cursor + 5]);
      const alpha = num(rules[cursor + 6], 1);
      const aMode = num(rules[cursor + 7]) | 0;
      const aCut = num(rules[cursor + 8]);
      const dbl = num(rules[cursor + 9]) | 0;
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].gltf.baseColor = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot2,
          color: { x: color.x, y: color.y, z: color.z },
          alpha,
          alphaMode: aMode,
          alphaCutoff: aCut,
          doubleSided: dbl
        };
      }
      return 10;
    }
    case PRIM_GLTF_NORMAL: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].gltf.normal = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot2
        };
      }
      return 5;
    }
    case PRIM_GLTF_METALLIC_ROUGHNESS: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      const metallic = num(rules[cursor + 5]);
      const rough = num(rules[cursor + 6]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].gltf.metallicRoughness = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot2,
          metallic,
          roughness: rough
        };
      }
      return 7;
    }
    case PRIM_GLTF_EMISSIVE: {
      const faces = facesOf(rules[cursor]);
      const tex = str(rules[cursor + 1]);
      const repeats = asVec(rules[cursor + 2]);
      const offsets = asVec(rules[cursor + 3]);
      const rot2 = num(rules[cursor + 4]);
      const tint = asVec(rules[cursor + 5]);
      for (const f of faces) {
        if (!inRange(f))
          continue;
        p.faces[f].gltf.emissive = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot2,
          tint: { x: tint.x, y: tint.y, z: tint.z }
        };
      }
      return 6;
    }
    case PRIM_LINK_TARGET:
      return null;
    default:
      return null;
  }
}
function writePrimType(p, rules, cursor) {
  const kind = num(rules[cursor]) | 0;
  switch (kind) {
    case SHAPE_BOX:
    case SHAPE_CYLINDER:
    case SHAPE_PRISM:
      p.shape = {
        kind,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        topSize: asVec(rules[cursor + 5]),
        topShear: asVec(rules[cursor + 6])
      };
      return 7;
    case SHAPE_SPHERE:
      p.shape = {
        kind: SHAPE_SPHERE,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        dimple: asVec(rules[cursor + 5])
      };
      return 6;
    case SHAPE_TORUS:
    case SHAPE_TUBE:
    case SHAPE_RING:
      p.shape = {
        kind,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        holeSize: asVec(rules[cursor + 5]),
        topShear: asVec(rules[cursor + 6]),
        advancedCut: asVec(rules[cursor + 7]),
        taper: asVec(rules[cursor + 8]),
        revolutions: num(rules[cursor + 9]),
        radiusOffset: num(rules[cursor + 10]),
        skew: num(rules[cursor + 11])
      };
      return 12;
    case SHAPE_SCULPT:
      p.shape = {
        kind: SHAPE_SCULPT,
        map: str(rules[cursor + 1]),
        type: num(rules[cursor + 2]) | 0
      };
      return 3;
    default:
      return null;
  }
}
function readPrimParam(prim, param, rules, cursor) {
  const p = prim.params;
  switch (param) {
    case PRIM_NAME:
      return { values: [prim.name], consumed: 0 };
    case PRIM_DESC:
      return { values: [prim.description], consumed: 0 };
    case PRIM_TEXT: {
      const t = prim.appearance.text;
      return { values: t ? [t.text, t.color, t.alpha] : ["", zero(), 0], consumed: 0 };
    }
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
      return { values: [p.position], consumed: 0 };
    case PRIM_ROTATION:
    case PRIM_ROT_LOCAL:
      return { values: [p.rotation], consumed: 0 };
    case PRIM_SIZE:
      return { values: [p.size], consumed: 0 };
    case PRIM_SLICE:
      return { values: [p.slice], consumed: 0 };
    case PRIM_MATERIAL:
      return { values: [p.material], consumed: 0 };
    case PRIM_PHYSICS:
      return { values: [(prim.statusFlags & STATUS_PHYSICS) !== 0 ? 1 : 0], consumed: 0 };
    case PRIM_PHANTOM:
      return { values: [(prim.statusFlags & STATUS_PHANTOM) !== 0 ? 1 : 0], consumed: 0 };
    case PRIM_TEMP_ON_REZ:
      return { values: [p.tempOnRez ? 1 : 0], consumed: 0 };
    case PRIM_PHYSICS_SHAPE_TYPE:
      return { values: [p.physicsShapeType], consumed: 0 };
    case PRIM_CAST_SHADOWS:
      return { values: [p.castShadows ? 1 : 0], consumed: 0 };
    case PRIM_ALLOW_UNSIT:
      return { values: [p.allowUnsit ? 1 : 0], consumed: 0 };
    case PRIM_SCRIPTED_SIT_ONLY:
      return { values: [p.scriptedSitOnly ? 1 : 0], consumed: 0 };
    case PRIM_SIT_FLAGS:
      return { values: [p.sitFlags], consumed: 0 };
    case PRIM_CLICK_ACTION:
      return { values: [p.clickAction], consumed: 0 };
    case PRIM_HEALTH:
      return { values: [p.health], consumed: 0 };
    case PRIM_DAMAGE:
      return { values: [p.damage.amount, p.damage.type], consumed: 0 };
    case PRIM_OMEGA:
      return { values: [p.omega.axis, p.omega.spinrate, p.omega.gain], consumed: 0 };
    case PRIM_POINT_LIGHT: {
      const l = p.pointLight;
      return { values: [l.enabled ? 1 : 0, l.color, l.intensity, l.radius, l.falloff], consumed: 0 };
    }
    case PRIM_REFLECTION_PROBE: {
      const r = p.reflectionProbe;
      return { values: [r.enabled ? 1 : 0, r.ambiance, r.clipDistance, r.flags], consumed: 0 };
    }
    case PRIM_PROJECTOR: {
      const j = p.projector;
      return { values: [j.texture, j.fov, j.focus, j.ambiance], consumed: 0 };
    }
    case PRIM_FLEXIBLE: {
      const f = p.flexible;
      return {
        values: [f.enabled ? 1 : 0, f.softness, f.gravity, f.friction, f.wind, f.tension, f.force],
        consumed: 0
      };
    }
    case PRIM_SIT_TARGET: {
      const s = p.sitTarget;
      return { values: [s.enabled ? 1 : 0, s.offset, s.rotation], consumed: 0 };
    }
    case PRIM_TYPE:
      return { values: readPrimType(p), consumed: 0 };
    case PRIM_COLOR: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].color, p.faces[f].alpha);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_TEXTURE: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const fa = p.faces[f];
        out.push(fa.texture, fa.textureRepeats, fa.textureOffsets, fa.textureRotation);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_RENDER_MATERIAL: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].renderMaterial);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_FULLBRIGHT: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].fullBright ? 1 : 0);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_GLOW: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].glow);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_BUMP_SHINY: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].bumpShiny.shiny, p.faces[f].bumpShiny.bump);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_TEXGEN: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].texgen);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_NORMAL: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const n = p.faces[f].normal;
        out.push(n.texture, n.textureRepeats, n.textureOffsets, n.textureRotation);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_SPECULAR: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const s = p.faces[f].specular;
        out.push(s.texture, s.textureRepeats, s.textureOffsets, s.textureRotation, s.color, s.glossiness, s.environment);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_ALPHA_MODE: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        out.push(p.faces[f].alphaMode.mode, p.faces[f].alphaMode.cutoff);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_GLTF_BASE_COLOR: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const g = p.faces[f].gltf.baseColor;
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.color, g.alpha, g.alphaMode, g.alphaCutoff, g.doubleSided);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_GLTF_NORMAL: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const g = p.faces[f].gltf.normal;
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_GLTF_METALLIC_ROUGHNESS: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const g = p.faces[f].gltf.metallicRoughness;
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.metallic, g.roughness);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_GLTF_EMISSIVE: {
      const faces = facesOf(rules[cursor]);
      const out = [];
      for (const f of faces) {
        if (!inRange(f))
          continue;
        const g = p.faces[f].gltf.emissive;
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.tint);
      }
      return { values: out, consumed: 1 };
    }
    case PRIM_LINK_TARGET:
      return null;
    default:
      return null;
  }
}
function readPrimType(p) {
  const s = p.shape;
  if (s.kind === SHAPE_SPHERE) {
    return [s.kind, s.hole, s.cut, s.hollow, s.twist, s.dimple];
  }
  if (s.kind === SHAPE_TORUS || s.kind === SHAPE_TUBE || s.kind === SHAPE_RING) {
    return [s.kind, s.hole, s.cut, s.hollow, s.twist, s.holeSize, s.topShear, s.advancedCut, s.taper, s.revolutions, s.radiusOffset, s.skew];
  }
  if (s.kind === SHAPE_SCULPT) {
    return [s.kind, s.map, s.type];
  }
  if (s.kind === SHAPE_BOX || s.kind === SHAPE_CYLINDER || s.kind === SHAPE_PRISM) {
    return [s.kind, s.hole, s.cut, s.hollow, s.twist, s.topSize, s.topShear];
  }
  return [];
}

// packages/vm/dist/prim.js
var Prim = class {
  /** 1-based link number assigned by the host Linkset. 0 = unlinked single prim. */
  linkNumber = 0;
  key;
  name;
  description;
  scripts = [];
  inventory = [];
  params = defaultPrimParams();
  /**
   * llSetStatus / PRIM_PHYSICS / PRIM_PHANTOM bitfield. Stored on the prim
   * (not in `params`) so `STATUS_*` flags without a PRIM_* counterpart
   * (BLOCK_GRAB, DIE_AT_EDGE, ROTATE_*, etc.) live alongside the
   * PRIM_PHYSICS / PRIM_PHANTOM bits in one place.
   */
  statusFlags = 0;
  appearance = { text: null, description: "" };
  /** Set when this prim joins a linkset. */
  linkset;
  constructor(opts = {}) {
    this.key = opts.key ?? NULL_KEY;
    this.name = opts.name ?? "Object";
    this.description = opts.description ?? "";
    this.appearance.description = this.description;
  }
  /** Add a script to this prim's inventory and roster. */
  addScript(script, opts = {}) {
    this.scripts.push(script);
    this.inventory.push({
      name: opts.name ?? script.scriptName,
      type: InventoryType.SCRIPT,
      key: opts.key ?? NULL_KEY,
      creator: NULL_KEY,
      description: "",
      acquireTimeMs: this.linkset?.clock.now ?? 0,
      permMask: {
        base: PERM_ALL,
        owner: PERM_ALL,
        group: 0,
        everyone: 0,
        next: PERM_ALL
      },
      script
    });
  }
  /**
   * Add a non-script inventory item (notecard, texture, etc.). The caller
   * is responsible for setting `acquireTimeMs`; if you want it to default
   * to the current linkset clock, build the item with `makeInventoryItem`
   * and pass `acquireTimeMs: this.linkset?.clock.now ?? 0`.
   */
  addInventory(item) {
    this.inventory.push({ ...item });
  }
  /** Find a script by inventory name. */
  findScript(name) {
    for (const it of this.inventory) {
      if (it.type === InventoryType.SCRIPT && it.name === name)
        return it.script;
    }
    return void 0;
  }
  /**
   * Read one PRIM_* rule starting at `cursor` in `rules`. Returns the flat
   * value list and the number of slots consumed past the rule constant
   * (face index, etc.), or `null` for unknown / unsupported constants.
   */
  getPrimParam(param, rules, cursor) {
    return readPrimParam(this, param, rules, cursor);
  }
  /**
   * Apply one PRIM_* rule starting at `cursor` in `rules`. Returns the
   * number of slots consumed past the rule constant, or `null` for
   * unknown / unsupported constants (caller stops walking).
   */
  setPrimParam(param, rules, cursor) {
    return writePrimParam(this, param, rules, cursor);
  }
  /** llSetStatus seam. STATUS_* is a bit value; sets or clears it. */
  setStatus(flag, value) {
    if (value)
      this.statusFlags |= flag;
    else
      this.statusFlags &= ~flag;
  }
};

// packages/vm/dist/linkset.js
var Linkset = class {
  clock = new LinksetClock();
  prims = [];
  /** Linkset-wide LSD store (was per-script before multi-script support). */
  linksetData = /* @__PURE__ */ new Map();
  /**
   * Cross-script capture of every `llMessageLinked` invocation in this
   * linkset. Append-only; long-running tests should call
   * `clearLinkedMessages()` between scenarios to keep memory bounded.
   */
  linkedMessages = [];
  /** Drop every captured cross-script linked-message entry. */
  clearLinkedMessages() {
    this.linkedMessages.length = 0;
  }
  owner;
  constructor(opts = {}) {
    this.owner = opts.owner ?? NULL_KEY;
  }
  /** Add a prim to the linkset; assigns a 1-based linkNumber. */
  addPrim(prim) {
    prim.linkset = this;
    this.prims.push(prim);
    this.recomputeLinkNumbers();
    return prim;
  }
  recomputeLinkNumbers() {
    if (this.prims.length === 1) {
      this.prims[0].linkNumber = 0;
      return;
    }
    for (let i = 0; i < this.prims.length; i++) {
      this.prims[i].linkNumber = i + 1;
    }
  }
  /** Flat list of every script in every prim, in prim/inventory order. */
  allScripts() {
    const out = [];
    for (const p of this.prims) {
      for (const s of p.scripts)
        out.push(s);
    }
    return out;
  }
  /** Locate the prim containing `script`, or undefined. */
  primOf(script) {
    return this.prims.find((p) => p.scripts.includes(script));
  }
  /** Resolve LINK_* / specific link number to the set of target prims. */
  resolveTargets(senderLink, target) {
    if (target === LINK_THIS) {
      const me = this.prims.find((p) => p.linkNumber === senderLink) ?? this.prims[0];
      return me ? [me] : [];
    }
    if (target === LINK_SET)
      return [...this.prims];
    if (target === LINK_ALL_OTHERS) {
      return this.prims.filter((p) => p.linkNumber !== senderLink);
    }
    if (target === LINK_ALL_CHILDREN) {
      if (this.prims.length <= 1)
        return [];
      return this.prims.filter((p) => p.linkNumber !== LINK_ROOT);
    }
    if (target >= LINK_ROOT) {
      const p = this.prims.find((pp) => pp.linkNumber === target);
      return p ? [p] : [];
    }
    if (target === 0 && this.prims.length === 1) {
      return [this.prims[0]];
    }
    return [];
  }
  /**
   * Schedule `linkset_data` events on every script in the linkset. The
   * caller is expected to have already mutated the shared LSD store before
   * broadcasting.
   */
  broadcastLinksetData(action, name, value) {
    const at = this.clock.now;
    for (const s of this.allScripts()) {
      this.clock.schedule(s, at, "linkset_data", { action, name, value });
    }
  }
  /**
   * Send a `link_message` according to LSL fan-out semantics.
   * `senderLink` is the calling prim's link number; the event payload's
   * `sender_num` is set to that value. The capture array on the linkset
   * records every invocation for cross-script test assertions.
   */
  deliverLinkMessage(senderLink, target, num3, str3, id) {
    this.linkedMessages.push({ target, num: num3, str: str3, id });
    const targets2 = this.resolveTargets(senderLink, target);
    const at = this.clock.now;
    for (const p of targets2) {
      for (const s of p.scripts) {
        this.clock.schedule(s, at, "link_message", { sender_num: senderLink, num: num3, str: str3, id });
      }
    }
  }
  /**
   * Deliver chat to every script in the linkset whose listens match. Useful
   * for region/world-level chat simulation. `Script.deliverChat` remains
   * available for the single-script case (delivers only to that script).
   */
  deliverChat(opts) {
    for (const s of this.allScripts()) {
      s.matchChatListens(opts);
    }
    this.drainQueue();
  }
  /**
   * Advance the shared clock by `ms` and drain every event that becomes
   * due, dispatching each to its target script.
   */
  advanceTime(ms) {
    this.clock.advance(ms);
    this.drainQueue();
  }
  /**
   * Drain due events in chronological order. Each event is delivered to
   * its target script via `script.deliver(event, payload)`. If a handler
   * triggers more events (timers, chained chats, …) they may become due
   * inside this loop and are picked up in the next iteration.
   *
   * The script roster is captured once per drain. Adding a script
   * mid-drain is rare (and would require an explicit prim mutation by a
   * builtin); when it happens, the new script's events are simply picked
   * up on the next outer drain. Worth-the-trade for avoiding an O(scripts)
   * allocation per event.
   */
  drainQueue() {
    const scripts = this.allScripts();
    if (scripts.length === 0)
      return;
    while (true) {
      const next = this.clock.takeNextDue(scripts);
      if (!next)
        return;
      const target = next.target;
      if (target.dead)
        continue;
      if (!target.running && next.event !== "__reset") {
        target.parkedEvents.push({ at: next.at, event: next.event, payload: next.payload });
        continue;
      }
      target.deliver(next.event, next.payload);
    }
  }
};

// packages/vm/dist/builtins/linked.js
var llMessageLinked = (ctx, args) => {
  const target = args[0] ?? LINK_THIS;
  const num3 = args[1] ?? 0;
  const str3 = args[2] ?? "";
  const id = args[3] ?? "";
  ctx.state.linkedMessages.push({ target, num: num3, str: str3, id });
  ctx.linkset.deliverLinkMessage(ctx.prim.linkNumber, target, num3, str3, id);
  return void 0;
};

// packages/vm/dist/builtins/dataserver.js
function nextKey(state) {
  state.dataserverKeyCounter += 1;
  return `data-req-${String(state.dataserverKeyCounter).padStart(8, "0")}`;
}
function record(ctx, source, args) {
  const key = nextKey(ctx.state);
  ctx.state.dataserverRequests.push({ key, source, args, fulfilled: false });
  return key;
}
var llRequestAgentData = (ctx, args) => record(ctx, "agent_data", [args[0], args[1]]);
var llRequestInventoryData = (ctx, args) => record(ctx, "inventory_data", [args[0]]);
var llRequestSimulatorData = (ctx, args) => record(ctx, "simulator_data", [args[0], args[1]]);
var llRequestUsername = (ctx, args) => record(ctx, "username", [args[0]]);
var llRequestDisplayName = (ctx, args) => record(ctx, "display_name", [args[0]]);

// packages/vm/dist/builtins/detected.js
function get(ctx) {
  return ctx.state.detectedStack[ctx.state.detectedStack.length - 1]?.entries ?? [];
}
function entry(ctx, args) {
  const i = args[0] ?? 0;
  const list = get(ctx);
  if (i < 0 || i >= list.length)
    return void 0;
  return list[i];
}
var llDetectedKey = (ctx, args) => entry(ctx, args)?.key ?? NULL_KEY;
var llDetectedName = (ctx, args) => entry(ctx, args)?.name ?? "";
var llDetectedOwner = (ctx, args) => entry(ctx, args)?.owner ?? entry(ctx, args)?.key ?? NULL_KEY;
var llDetectedGroup = (ctx, args) => entry(ctx, args)?.group ?? NULL_KEY;
var llDetectedPos = (ctx, args) => entry(ctx, args)?.pos ?? ZERO_VECTOR;
var llDetectedRot = (ctx, args) => entry(ctx, args)?.rot ?? ZERO_ROTATION;
var llDetectedVel = (ctx, args) => entry(ctx, args)?.vel ?? ZERO_VECTOR;
var llDetectedType = (ctx, args) => entry(ctx, args)?.type ?? 0;
var llDetectedLinkNumber = (ctx, args) => entry(ctx, args)?.linkNumber ?? 0;
var llDetectedGrab = (ctx, args) => entry(ctx, args)?.grab ?? ZERO_VECTOR;
var llDetectedTouchPos = (ctx, args) => entry(ctx, args)?.touchPos ?? ZERO_VECTOR;

// packages/vm/dist/builtins/hash.js
import { createHash, createHmac } from "crypto";
var lowerHex = (h) => h.digest("hex");
var llMD5String = (_ctx, args) => {
  const message = args[0] ?? "";
  const nonce = args[1] ?? 0;
  const h = createHash("md5");
  h.update(`${message}:${nonce}`, "utf8");
  return lowerHex(h);
};
var llSHA1String = (_ctx, args) => {
  const message = args[0] ?? "";
  return lowerHex(createHash("sha1").update(message, "utf8"));
};
var llSHA256String = (_ctx, args) => {
  const message = args[0] ?? "";
  return lowerHex(createHash("sha256").update(message, "utf8"));
};
var llHMAC = (_ctx, args) => {
  const key = args[0] ?? "";
  const message = args[1] ?? "";
  const algo = (args[2] ?? "sha256").toLowerCase();
  const supported = /* @__PURE__ */ new Set(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"]);
  if (!supported.has(algo))
    return "";
  return createHmac(algo, key).update(message, "utf8").digest("base64");
};

// packages/vm/dist/builtins/base64.js
var llStringToBase64 = (_ctx, args) => {
  const s = args[0] ?? "";
  return Buffer.from(s, "utf8").toString("base64");
};
var llBase64ToString = (_ctx, args) => {
  const s = args[0] ?? "";
  return Buffer.from(s, "base64").toString("utf8");
};
var llIntegerToBase64 = (_ctx, args) => {
  const x = toInt32(args[0] ?? 0);
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(x, 0);
  return buf.toString("base64");
};
var llBase64ToInteger = (_ctx, args) => {
  const s = args[0] ?? "";
  const buf = Buffer.from(s, "base64");
  if (buf.length < 4)
    return 0;
  return buf.readInt32BE(0);
};

// packages/vm/dist/builtins/link-info.js
var llGetLinkNumber = (ctx) => ctx.prim.linkNumber;
var llGetNumberOfPrims = (ctx) => ctx.linkset.prims.length;
var llGetLinkKey = (ctx, args) => {
  const link = args[0] ?? 0;
  const prim = findPrim(ctx, link);
  return prim ? prim.key : NULL_KEY;
};
var llGetLinkName = (ctx, args) => {
  const link = args[0] ?? 0;
  const prim = findPrim(ctx, link);
  return prim ? prim.name : "";
};
function findPrim(ctx, link) {
  if (link === 0 && ctx.linkset.prims.length === 1)
    return ctx.linkset.prims[0];
  if (link === LINK_THIS)
    return ctx.prim;
  return ctx.linkset.prims.find((p) => p.linkNumber === link);
}

// packages/vm/dist/builtins/inventory.js
function itemsOfType(items, type) {
  if (type === INVENTORY_ALL)
    return [...items];
  return items.filter((it) => it.type === type);
}
function find(items, name) {
  return items.find((it) => it.name === name);
}
var llGetInventoryNumber = (ctx, args) => {
  const type = args[0] ?? INVENTORY_ALL;
  return itemsOfType(ctx.prim.inventory, type).length;
};
var llGetInventoryName = (ctx, args) => {
  const type = args[0] ?? INVENTORY_ALL;
  const i = args[1] ?? 0;
  const items = itemsOfType(ctx.prim.inventory, type);
  return items[i]?.name ?? "";
};
var llGetInventoryType = (ctx, args) => {
  const name = args[0] ?? "";
  return find(ctx.prim.inventory, name)?.type ?? INVENTORY_NONE;
};
var llGetInventoryKey = (ctx, args) => {
  const name = args[0] ?? "";
  return find(ctx.prim.inventory, name)?.key ?? NULL_KEY;
};
var llGetInventoryCreator = (ctx, args) => {
  const name = args[0] ?? "";
  return find(ctx.prim.inventory, name)?.creator ?? NULL_KEY;
};
var llGetInventoryDesc = (ctx, args) => {
  const name = args[0] ?? "";
  return find(ctx.prim.inventory, name)?.description ?? "";
};
var llGetInventoryAcquireTime = (ctx, args) => {
  const name = args[0] ?? "";
  const item = find(ctx.prim.inventory, name);
  if (!item)
    return "";
  return new Date(item.acquireTimeMs).toISOString().replace(/\.\d{3}Z$/, "Z");
};
var llGetInventoryPermMask = (ctx, args) => {
  const name = args[0] ?? "";
  const mask = args[1] ?? 0;
  const item = find(ctx.prim.inventory, name);
  if (!item)
    return 0;
  switch (mask) {
    case MASK_BASE:
      return item.permMask.base;
    case MASK_OWNER:
      return item.permMask.owner;
    case MASK_GROUP:
      return item.permMask.group;
    case MASK_EVERYONE:
      return item.permMask.everyone;
    case MASK_NEXT:
      return item.permMask.next;
    default:
      return 0;
  }
};
var llGetNotecardLine = (ctx, args) => {
  const name = args[0] ?? "";
  const line = args[1] ?? 0;
  const item = find(ctx.prim.inventory, name);
  ctx.state.dataserverKeyCounter += 1;
  const key = `data-req-${String(ctx.state.dataserverKeyCounter).padStart(8, "0")}`;
  ctx.state.dataserverRequests.push({
    key,
    source: "notecard_line",
    args: [name, line],
    fulfilled: false
  });
  let text = NAK;
  if (item && item.type === InventoryType.NOTECARD && item.notecardLines) {
    text = line >= 0 && line < item.notecardLines.length ? item.notecardLines[line] : EOF;
  }
  const delayMs = (ctx.spec?.delay ?? 0) * 1e3;
  ctx.state.clock.schedule(ctx.state.clock.now + delayMs, "dataserver", { queryid: key, data: text });
  const req = ctx.state.dataserverRequests[ctx.state.dataserverRequests.length - 1];
  req.fulfilled = true;
  return key;
};
var llGetNumberOfNotecardLines = (ctx, args) => {
  const name = args[0] ?? "";
  const item = find(ctx.prim.inventory, name);
  ctx.state.dataserverKeyCounter += 1;
  const key = `data-req-${String(ctx.state.dataserverKeyCounter).padStart(8, "0")}`;
  ctx.state.dataserverRequests.push({
    key,
    source: "notecard_lines",
    args: [name],
    fulfilled: false
  });
  const data = item && item.type === InventoryType.NOTECARD && item.notecardLines ? String(item.notecardLines.length) : NAK;
  const delayMs = (ctx.spec?.delay ?? 0) * 1e3;
  ctx.state.clock.schedule(ctx.state.clock.now + delayMs, "dataserver", { queryid: key, data });
  const req = ctx.state.dataserverRequests[ctx.state.dataserverRequests.length - 1];
  req.fulfilled = true;
  return key;
};

// packages/vm/dist/builtins/script-control.js
var llResetOtherScript = (ctx, args) => {
  const name = args[0] ?? "";
  const target = ctx.prim.findScript(name);
  if (!target)
    return void 0;
  ctx.linkset.clock.schedule(target, ctx.linkset.clock.now, "__reset", {});
  return void 0;
};
var llSetScriptState = (ctx, args) => {
  const name = args[0] ?? "";
  const running = (args[1] ?? 0) !== 0;
  const target = ctx.prim.findScript(name);
  if (!target)
    return void 0;
  const wasRunning = target.running;
  target.running = running;
  if (running && !wasRunning) {
    const v = target.clockView;
    if (v.timerIntervalMs > 0) {
      v.timerNextFireMs = ctx.linkset.clock.now + v.timerIntervalMs;
    }
    target.resumeParked();
  }
  return void 0;
};
var llGetScriptState = (ctx, args) => {
  const name = args[0] ?? "";
  const target = ctx.prim.findScript(name);
  return target && target.running ? 1 : 0;
};

// packages/vm/dist/builtins/linksetdata.js
var LSD_AVAILABLE_BYTES = 131072;
function fireEvent(ctx, action, keyname, value) {
  ctx.linkset.broadcastLinksetData(action, keyname, value);
}
function compilePattern(pattern) {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
function slice(arr, start, count) {
  if (arr.length === 0)
    return [];
  let s = start < 0 ? arr.length + start : start;
  if (s < 0)
    s = 0;
  if (s >= arr.length)
    return [];
  const end = count < 0 ? arr.length : Math.min(arr.length, s + count);
  return arr.slice(s, end);
}
var llLinksetDataWrite = (ctx, args) => {
  const name = args[0] ?? "";
  const value = args[1] ?? "";
  if (name === "")
    return LINKSETDATA_ENOKEY;
  const store = ctx.state.linksetData;
  const existing = store.get(name);
  if (existing && existing.password !== "")
    return LINKSETDATA_EPROTECTED;
  if (value === "") {
    if (!existing)
      return LINKSETDATA_NOTFOUND;
    store.delete(name);
    fireEvent(ctx, LINKSETDATA_DELETE, name, "");
    return LINKSETDATA_OK;
  }
  if (existing && existing.value === value)
    return LINKSETDATA_NOUPDATE;
  store.set(name, { value, password: "" });
  fireEvent(ctx, LINKSETDATA_UPDATE, name, "");
  return LINKSETDATA_OK;
};
var llLinksetDataWriteProtected = (ctx, args) => {
  const name = args[0] ?? "";
  const value = args[1] ?? "";
  const password = args[2] ?? "";
  if (name === "")
    return LINKSETDATA_ENOKEY;
  const store = ctx.state.linksetData;
  const existing = store.get(name);
  if (existing && existing.password !== "" && existing.password !== password) {
    return LINKSETDATA_EPROTECTED;
  }
  if (value === "") {
    if (!existing)
      return LINKSETDATA_NOTFOUND;
    store.delete(name);
    fireEvent(ctx, LINKSETDATA_DELETE, name, "");
    return LINKSETDATA_OK;
  }
  if (existing && existing.value === value && existing.password === password) {
    return LINKSETDATA_NOUPDATE;
  }
  store.set(name, { value, password });
  fireEvent(ctx, LINKSETDATA_UPDATE, name, "");
  return LINKSETDATA_OK;
};
var llLinksetDataRead = (ctx, args) => {
  const name = args[0] ?? "";
  const entry2 = ctx.state.linksetData.get(name);
  if (!entry2)
    return "";
  if (entry2.password !== "")
    return "";
  return entry2.value;
};
var llLinksetDataReadProtected = (ctx, args) => {
  const name = args[0] ?? "";
  const password = args[1] ?? "";
  const entry2 = ctx.state.linksetData.get(name);
  if (!entry2)
    return "";
  if (entry2.password !== "" && entry2.password !== password)
    return "";
  return entry2.value;
};
var llLinksetDataDelete = (ctx, args) => {
  const name = args[0] ?? "";
  if (name === "")
    return LINKSETDATA_ENOKEY;
  const store = ctx.state.linksetData;
  const entry2 = store.get(name);
  if (!entry2)
    return LINKSETDATA_NOTFOUND;
  if (entry2.password !== "")
    return LINKSETDATA_EPROTECTED;
  store.delete(name);
  fireEvent(ctx, LINKSETDATA_DELETE, name, "");
  return LINKSETDATA_OK;
};
var llLinksetDataDeleteProtected = (ctx, args) => {
  const name = args[0] ?? "";
  const password = args[1] ?? "";
  if (name === "")
    return LINKSETDATA_ENOKEY;
  const store = ctx.state.linksetData;
  const entry2 = store.get(name);
  if (!entry2)
    return LINKSETDATA_NOTFOUND;
  if (entry2.password !== "" && entry2.password !== password)
    return LINKSETDATA_EPROTECTED;
  store.delete(name);
  fireEvent(ctx, LINKSETDATA_DELETE, name, "");
  return LINKSETDATA_OK;
};
var llLinksetDataDeleteFound = (ctx, args) => {
  const pattern = args[0] ?? "";
  const password = args[1] ?? "";
  const re = compilePattern(pattern);
  if (!re)
    return [0, 0];
  const store = ctx.state.linksetData;
  let deleted = 0;
  let notDeleted = 0;
  for (const [name, entry2] of [...store.entries()]) {
    if (!re.test(name))
      continue;
    if (entry2.password !== "" && entry2.password !== password) {
      notDeleted += 1;
      continue;
    }
    store.delete(name);
    deleted += 1;
  }
  if (deleted > 0) {
    fireEvent(ctx, LINKSETDATA_MULTIDELETE, String(deleted), String(notDeleted));
  }
  return [deleted, notDeleted];
};
var llLinksetDataReset = (ctx) => {
  ctx.state.linksetData.clear();
  fireEvent(ctx, LINKSETDATA_RESET, "", "");
  return void 0;
};
var llLinksetDataAvailable = (ctx) => {
  let used = 0;
  for (const [k, e] of ctx.state.linksetData) {
    used += k.length + e.value.length + e.password.length;
  }
  return Math.max(0, LSD_AVAILABLE_BYTES - used);
};
var llLinksetDataCountKeys = (ctx) => {
  return ctx.state.linksetData.size;
};
var llLinksetDataListKeys = (ctx, args) => {
  const start = args[0] ?? 0;
  const count = args[1] ?? -1;
  return slice([...ctx.state.linksetData.keys()], start, count);
};
var llLinksetDataFindKeys = (ctx, args) => {
  const pattern = args[0] ?? "";
  const start = args[1] ?? 0;
  const count = args[2] ?? -1;
  const re = compilePattern(pattern);
  if (!re)
    return [];
  const matches = [...ctx.state.linksetData.keys()].filter((k) => re.test(k));
  return slice(matches, start, count);
};
var llLinksetDataCountFound = (ctx, args) => {
  const pattern = args[0] ?? "";
  const re = compilePattern(pattern);
  if (!re)
    return 0;
  let n = 0;
  for (const k of ctx.state.linksetData.keys())
    if (re.test(k))
      n += 1;
  return n;
};

// packages/vm/dist/builtins/prim-params.js
function walkSet(linkset, caller, target, rules) {
  let cur = target;
  let i = 0;
  while (i < rules.length) {
    const rule = rules[i];
    if (typeof rule !== "number")
      return;
    if (rule === PRIM_LINK_TARGET) {
      const link = rules[i + 1] | 0;
      cur = linkset.resolveTargets(caller.linkNumber, link);
      i += 2;
      continue;
    }
    let consumed = null;
    for (const p of cur) {
      const c = p.setPrimParam(rule, rules, i + 1);
      if (c === null)
        return;
      consumed = c;
    }
    if (consumed === null) {
      const slots = writePrimParamSlots(rule, rules, i + 1);
      if (slots === null)
        return;
      consumed = slots;
    }
    i += 1 + consumed;
  }
}
function walkGet(linkset, caller, startTarget, rules) {
  const out = [];
  let cur = startTarget;
  let i = 0;
  while (i < rules.length) {
    const rule = rules[i];
    if (typeof rule !== "number")
      return out;
    if (rule === PRIM_LINK_TARGET) {
      const link = rules[i + 1] | 0;
      cur = linkset.resolveTargets(caller.linkNumber, link);
      i += 2;
      continue;
    }
    let consumed;
    if (cur.length === 0) {
      const probe = caller.getPrimParam(rule, rules, i + 1);
      if (probe === null)
        return out;
      consumed = probe.consumed;
    } else {
      let unknown = false;
      let c = 0;
      for (const p of cur) {
        const r = p.getPrimParam(rule, rules, i + 1);
        if (r === null) {
          unknown = true;
          break;
        }
        out.push(...r.values);
        c = r.consumed;
      }
      if (unknown)
        return out;
      consumed = c;
    }
    i += 1 + consumed;
  }
  return out;
}
var llSetPrimitiveParams = (ctx, args) => {
  const rules = args[0] ?? [];
  walkSet(ctx.linkset, ctx.prim, [ctx.prim], rules);
  return void 0;
};
var llSetLinkPrimitiveParams = (ctx, args) => {
  const link = (args[0] ?? 0) | 0;
  const rules = args[1] ?? [];
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link);
  walkSet(ctx.linkset, ctx.prim, target, rules);
  return void 0;
};
var llSetLinkPrimitiveParamsFast = (ctx, args) => {
  const link = (args[0] ?? 0) | 0;
  const rules = args[1] ?? [];
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link);
  walkSet(ctx.linkset, ctx.prim, target, rules);
  return void 0;
};
var llGetPrimitiveParams = (ctx, args) => {
  const rules = args[0] ?? [];
  return walkGet(ctx.linkset, ctx.prim, [ctx.prim], rules);
};
var llGetLinkPrimitiveParams = (ctx, args) => {
  const link = (args[0] ?? 0) | 0;
  const rules = args[1] ?? [];
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link);
  return walkGet(ctx.linkset, ctx.prim, target, rules);
};

// packages/vm/dist/builtins/prim-accessors.js
var num2 = (v, d = 0) => typeof v === "number" ? v : d;
var str2 = (v, d = "") => typeof v === "string" ? v : d;
var vecOf = (v) => v && typeof v === "object" && !Array.isArray(v) && "x" in v && "y" in v && "z" in v && !("s" in v) ? v : ZERO_VECTOR;
var rotOf = (v) => v && typeof v === "object" && !Array.isArray(v) && "s" in v ? v : ZERO_ROTATION;
function targets(linkset, sender, link) {
  return linkset.resolveTargets(sender, link);
}
var llSetPos = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_POSITION, [vecOf(args[0])], 0);
  return void 0;
};
var llGetPos = (ctx) => ctx.prim.params.position;
var llGetLocalPos = (ctx) => ctx.prim.params.position;
var llGetRootPosition = (ctx) => {
  const root = ctx.linkset.prims[0] ?? ctx.prim;
  return root.params.position;
};
var llSetRot = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_ROTATION, [rotOf(args[0])], 0);
  return void 0;
};
var llSetLocalRot = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_ROT_LOCAL, [rotOf(args[0])], 0);
  return void 0;
};
var llGetRot = (ctx) => ctx.prim.params.rotation;
var llGetLocalRot = (ctx) => ctx.prim.params.rotation;
var llGetRootRotation = (ctx) => {
  const root = ctx.linkset.prims[0] ?? ctx.prim;
  return root.params.rotation;
};
var llSetScale = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_SIZE, [vecOf(args[0])], 0);
  return void 0;
};
var llGetScale = (ctx) => ctx.prim.params.size;
var llScaleByFactor = (ctx, args) => {
  const factor = num2(args[0], 1);
  if (!Number.isFinite(factor) || factor <= 0)
    return 0;
  for (const p of ctx.linkset.prims) {
    const s = p.params.size;
    p.params.size = { x: s.x * factor, y: s.y * factor, z: s.z * factor };
  }
  return 1;
};
var llGetMaxScaleFactor = () => 64;
var llGetMinScaleFactor = () => 0.01;
var llSetColor = (ctx, args) => {
  const color = vecOf(args[0]);
  const face = num2(args[1], ALL_SIDES) | 0;
  const clone = () => ({ x: color.x, y: color.y, z: color.z });
  if (face === ALL_SIDES) {
    for (let f = 0; f < 6; f++)
      ctx.prim.params.faces[f].color = clone();
  } else if (face >= 0 && face <= 5) {
    ctx.prim.params.faces[face].color = clone();
  }
  return void 0;
};
var llGetColor = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face === ALL_SIDES) {
    let x = 0, y = 0, z = 0;
    for (let f = 0; f < 6; f++) {
      const c = ctx.prim.params.faces[f].color;
      x += c.x;
      y += c.y;
      z += c.z;
    }
    return { x: x / 6, y: y / 6, z: z / 6 };
  }
  if (face < 0 || face > 5)
    return ZERO_VECTOR;
  return ctx.prim.params.faces[face].color;
};
var llSetAlpha = (ctx, args) => {
  const alpha = num2(args[0], 1);
  const face = num2(args[1], ALL_SIDES) | 0;
  if (face === ALL_SIDES) {
    for (let f = 0; f < 6; f++)
      ctx.prim.params.faces[f].alpha = alpha;
  } else if (face >= 0 && face <= 5) {
    ctx.prim.params.faces[face].alpha = alpha;
  }
  return void 0;
};
var llGetAlpha = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face === ALL_SIDES) {
    let a = 0;
    for (let f = 0; f < 6; f++)
      a += ctx.prim.params.faces[f].alpha;
    return a / 6;
  }
  if (face < 0 || face > 5)
    return 0;
  return ctx.prim.params.faces[face].alpha;
};
var llSetTexture = (ctx, args) => {
  const tex = str2(args[0]);
  const face = num2(args[1], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const f of list)
    ctx.prim.params.faces[f].texture = tex;
  return void 0;
};
var llGetTexture = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face < 0 || face > 5)
    return "";
  return ctx.prim.params.faces[face].texture;
};
var llGetTextureOffset = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face < 0 || face > 5)
    return ZERO_VECTOR;
  return ctx.prim.params.faces[face].textureOffsets;
};
var llGetTextureScale = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face < 0 || face > 5)
    return ZERO_VECTOR;
  return ctx.prim.params.faces[face].textureRepeats;
};
var llGetTextureRot = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face < 0 || face > 5)
    return 0;
  return ctx.prim.params.faces[face].textureRotation;
};
var llScaleTexture = (ctx, args) => {
  const u = num2(args[0]);
  const v = num2(args[1]);
  const face = num2(args[2], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const f of list)
    ctx.prim.params.faces[f].textureRepeats = { x: u, y: v, z: 0 };
  return void 0;
};
var llOffsetTexture = (ctx, args) => {
  const u = num2(args[0]);
  const v = num2(args[1]);
  const face = num2(args[2], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const f of list)
    ctx.prim.params.faces[f].textureOffsets = { x: u, y: v, z: 0 };
  return void 0;
};
var llRotateTexture = (ctx, args) => {
  const angle = num2(args[0]);
  const face = num2(args[1], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const f of list)
    ctx.prim.params.faces[f].textureRotation = angle;
  return void 0;
};
var llSetLinkColor = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const color = vecOf(args[1]);
  const face = num2(args[2], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of list)
      p.params.faces[f].color = { x: color.x, y: color.y, z: color.z };
  }
  return void 0;
};
var llSetLinkAlpha = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const alpha = num2(args[1], 1);
  const face = num2(args[2], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of list)
      p.params.faces[f].alpha = alpha;
  }
  return void 0;
};
var llSetLinkTexture = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const tex = str2(args[1]);
  const face = num2(args[2], ALL_SIDES) | 0;
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [];
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of list)
      p.params.faces[f].texture = tex;
  }
  return void 0;
};
var llSetTextureAnim = (ctx, args) => {
  ctx.prim.params.textureAnim = {
    mode: num2(args[0]) | 0,
    face: num2(args[1]) | 0,
    sizex: num2(args[2]) | 0,
    sizey: num2(args[3]) | 0,
    start: num2(args[4]),
    length: num2(args[5]),
    rate: num2(args[6])
  };
  return void 0;
};
var llSetLinkTextureAnim = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const anim = {
    mode: num2(args[1]) | 0,
    face: num2(args[2]) | 0,
    sizex: num2(args[3]) | 0,
    sizey: num2(args[4]) | 0,
    start: num2(args[5]),
    length: num2(args[6]),
    rate: num2(args[7])
  };
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    p.params.textureAnim = { ...anim };
  }
  return void 0;
};
var llSetLinkTextureAnimOverrideMe = (ctx, args) => llSetLinkTextureAnim(ctx, args);
var llSetRenderMaterial = (ctx, args) => {
  const material = str2(args[0]);
  const face = num2(args[1], ALL_SIDES) | 0;
  ctx.prim.setPrimParam(PRIM_RENDER_MATERIAL, [face, material], 0);
  return void 0;
};
var llGetRenderMaterial = (ctx, args) => {
  const face = num2(args[0], 0) | 0;
  if (face < 0 || face > 5)
    return "";
  return ctx.prim.params.faces[face].renderMaterial;
};
var llSetStatus = (ctx, args) => {
  const flag = num2(args[0]) | 0;
  const value = num2(args[1]) !== 0;
  ctx.prim.setStatus(flag, value);
  return void 0;
};
var llGetStatus = (ctx, args) => {
  const flag = num2(args[0]) | 0;
  return (ctx.prim.statusFlags & flag) !== 0 ? 1 : 0;
};
var llSetLinkStatus = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const flag = num2(args[1]) | 0;
  const value = num2(args[2]) !== 0;
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link))
    p.setStatus(flag, value);
  return void 0;
};
var llSetClickAction = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_CLICK_ACTION, [num2(args[0]) | 0], 0);
  return void 0;
};
var llTargetOmega = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_OMEGA, [vecOf(args[0]), num2(args[1]), num2(args[2])], 0);
  return void 0;
};
var llSetPhysicsMaterial = (ctx, args) => {
  const mask = num2(args[0]) | 0;
  const m = ctx.prim.params.physicsMaterial;
  if (mask & GRAVITY_MULTIPLIER)
    m.gravityMultiplier = num2(args[1], 1);
  if (mask & RESTITUTION)
    m.restitution = num2(args[2]);
  if (mask & FRICTION)
    m.friction = num2(args[3]);
  if (mask & DENSITY)
    m.density = num2(args[4], 1e3);
  return void 0;
};
var llGetPhysicsMaterial = (ctx) => {
  const m = ctx.prim.params.physicsMaterial;
  return [m.gravityMultiplier, m.restitution, m.friction, m.density];
};
var llPassCollisions = (ctx, args) => {
  ctx.prim.params.passCollisions = num2(args[0]) | 0;
  return void 0;
};
var llPassTouches = (ctx, args) => {
  ctx.prim.params.passTouches = num2(args[0]) | 0;
  return void 0;
};
var llSitTarget = (ctx, args) => {
  const offset = vecOf(args[0]);
  const rot2 = rotOf(args[1]);
  const enabled = !(offset.x === 0 && offset.y === 0 && offset.z === 0);
  ctx.prim.setPrimParam(PRIM_SIT_TARGET, [enabled ? 1 : 0, offset, rot2], 0);
  return void 0;
};
var llLinkSitTarget = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const offset = vecOf(args[1]);
  const rot2 = rotOf(args[2]);
  const enabled = !(offset.x === 0 && offset.y === 0 && offset.z === 0);
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    p.setPrimParam(PRIM_SIT_TARGET, [enabled ? 1 : 0, offset, rot2], 0);
  }
  return void 0;
};
var llAvatarOnSitTarget = () => NULL_KEY;
var llAvatarOnLinkSitTarget = () => NULL_KEY;
var llSetLinkSitFlags = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const flags = num2(args[1]) | 0;
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    p.setPrimParam(PRIM_SIT_FLAGS, [flags], 0);
  }
  return void 0;
};
var llGetLinkSitFlags = (ctx, args) => {
  const link = num2(args[0]) | 0;
  const ts = targets(ctx.linkset, ctx.prim.linkNumber, link);
  return ts[0]?.params.sitFlags ?? 0;
};

// packages/vm/dist/builtins/index.js
var REAL_BUILTINS = {
  llSay,
  llShout,
  llWhisper,
  llOwnerSay,
  llSetTimerEvent,
  llSleep,
  llGetTime,
  llGetAndResetTime,
  llResetTime,
  llHTTPRequest,
  llHTTPResponse,
  llListen,
  llListenRemove,
  llListenControl,
  // math
  llAbs,
  llFabs,
  llRound,
  llCeil,
  llFloor,
  llPow,
  llSqrt,
  llSin,
  llCos,
  llTan,
  llAsin,
  llAcos,
  llAtan2,
  llLog,
  llLog10,
  llFrand,
  llVecMag,
  llVecNorm,
  llVecDist,
  llRot2Euler,
  llEuler2Rot,
  // strings
  llStringLength,
  llSubStringIndex,
  llGetSubString,
  llDeleteSubString,
  llInsertString,
  llStringTrim,
  llToLower,
  llToUpper,
  llReplaceSubString,
  llEscapeURL,
  llUnescapeURL,
  // lists
  llGetListLength,
  llList2Integer,
  llList2Float,
  llList2String,
  llList2Key,
  llList2Vector,
  llList2Rot,
  llList2List,
  llDeleteSubList,
  llListInsertList,
  llListReplaceList,
  llListFindList,
  llDumpList2String,
  llCSV2List,
  llParseString2List,
  // json
  llJson2List,
  llJsonGetValue,
  llJsonSetValue,
  llJsonValueType,
  llList2Json,
  // identity
  llGetOwner,
  llGetCreator,
  llGetKey,
  llGetObjectName,
  llSetObjectName,
  llGetScriptName,
  // linked
  llMessageLinked,
  // dataserver
  llRequestAgentData,
  llRequestInventoryData,
  llRequestSimulatorData,
  llRequestUsername,
  llRequestDisplayName,
  // detected
  llDetectedKey,
  llDetectedName,
  llDetectedOwner,
  llDetectedGroup,
  llDetectedPos,
  llDetectedRot,
  llDetectedVel,
  llDetectedType,
  llDetectedLinkNumber,
  llDetectedGrab,
  llDetectedTouchPos,
  // hash
  llMD5String,
  llSHA1String,
  llSHA256String,
  llHMAC,
  // base64
  llStringToBase64,
  llBase64ToString,
  llIntegerToBase64,
  llBase64ToInteger,
  // object
  llSetText,
  llSetObjectDesc,
  llGetObjectDesc,
  llDie,
  llResetScript,
  // link info
  llGetLinkNumber,
  llGetNumberOfPrims,
  llGetLinkKey,
  llGetLinkName,
  // inventory
  llGetInventoryNumber,
  llGetInventoryName,
  llGetInventoryType,
  llGetInventoryKey,
  llGetInventoryCreator,
  llGetInventoryDesc,
  llGetInventoryAcquireTime,
  llGetInventoryPermMask,
  llGetNotecardLine,
  llGetNumberOfNotecardLines,
  // script control
  llResetOtherScript,
  llSetScriptState,
  llGetScriptState,
  // linkset data
  llLinksetDataWrite,
  llLinksetDataWriteProtected,
  llLinksetDataRead,
  llLinksetDataReadProtected,
  llLinksetDataDelete,
  llLinksetDataDeleteProtected,
  llLinksetDataDeleteFound,
  llLinksetDataReset,
  llLinksetDataAvailable,
  llLinksetDataCountKeys,
  llLinksetDataListKeys,
  llLinksetDataFindKeys,
  llLinksetDataCountFound,
  // primitive params (rules-based)
  llSetPrimitiveParams,
  llSetLinkPrimitiveParams,
  llSetLinkPrimitiveParamsFast,
  llGetPrimitiveParams,
  llGetLinkPrimitiveParams,
  // primitive params (alternative accessors)
  llSetPos,
  llGetPos,
  llGetLocalPos,
  llGetRootPosition,
  llSetRot,
  llSetLocalRot,
  llGetRot,
  llGetLocalRot,
  llGetRootRotation,
  llSetScale,
  llGetScale,
  llScaleByFactor,
  llGetMaxScaleFactor,
  llGetMinScaleFactor,
  llSetColor,
  llGetColor,
  llSetAlpha,
  llGetAlpha,
  llSetTexture,
  llGetTexture,
  llGetTextureOffset,
  llGetTextureScale,
  llGetTextureRot,
  llScaleTexture,
  llOffsetTexture,
  llRotateTexture,
  llSetLinkColor,
  llSetLinkAlpha,
  llSetLinkTexture,
  llSetTextureAnim,
  llSetLinkTextureAnim,
  llSetLinkTextureAnimOverrideMe,
  llSetRenderMaterial,
  llGetRenderMaterial,
  llSetStatus,
  llGetStatus,
  llSetLinkStatus,
  llSetClickAction,
  llTargetOmega,
  llSetPhysicsMaterial,
  llGetPhysicsMaterial,
  llPassCollisions,
  llPassTouches,
  llSitTarget,
  llLinkSitTarget,
  llAvatarOnSitTarget,
  llAvatarOnLinkSitTarget,
  llSetLinkSitFlags,
  llGetLinkSitFlags
};

// packages/vm/dist/dispatch.js
function specFor(name) {
  return BUILTIN_SPECS[name];
}
function callBuiltin(dctx, name, args) {
  const spec = specFor(name);
  const impl = dctx.mocks[name] ?? REAL_BUILTINS[name] ?? makeStub(name);
  const ctx = {
    state: dctx.state,
    spec,
    script: dctx.script,
    prim: dctx.script.host,
    linkset: dctx.script.linkset
  };
  const result = impl(ctx, args);
  dctx.state.calls.push({ name, args, returned: result });
  if (spec && spec.delay > 0) {
    dctx.state.clock.advance(spec.delay * 1e3);
  }
  return result;
}
function makeStub(name) {
  const spec = specFor(name);
  if (!spec) {
    return () => {
      throw new Error(`unknown LSL function '${name}' (not in kwdb; use script.mock to provide it)`);
    };
  }
  return () => defaultValueFor(spec.returnType);
}

// packages/vm/dist/values/coerce.js
function coerce(from, target) {
  if (from.type === target)
    return from;
  const v = from.value;
  switch (target) {
    case "integer": {
      if (typeof v === "number")
        return { type: "integer", value: toInt32(Math.trunc(v)) };
      if (typeof v === "string")
        return { type: "integer", value: parseLslInteger(v) };
      throw typeError(from, target);
    }
    case "float": {
      if (typeof v === "number")
        return { type: "float", value: v };
      if (typeof v === "string")
        return { type: "float", value: parseLslFloat(v) };
      throw typeError(from, target);
    }
    case "string": {
      return { type: "string", value: stringify(from) };
    }
    case "key": {
      if (typeof v === "string")
        return { type: "key", value: v };
      throw typeError(from, target);
    }
    case "vector": {
      if (isVector(v))
        return { type: "vector", value: v };
      if (typeof v === "string")
        return { type: "vector", value: parseLslVector(v) };
      throw typeError(from, target);
    }
    case "rotation": {
      if (isRotation(v))
        return { type: "rotation", value: v };
      if (typeof v === "string")
        return { type: "rotation", value: parseLslRotation(v) };
      throw typeError(from, target);
    }
    case "list": {
      if (Array.isArray(v))
        return { type: "list", value: v };
      return { type: "list", value: [v] };
    }
    case "void":
      throw new Error("cannot coerce to void");
  }
}
function typeError(from, target) {
  return new Error(`cannot coerce ${from.type} to ${target}`);
}
function stringify(r) {
  const v = r.value;
  switch (r.type) {
    case "integer":
      return String(toInt32(v));
    case "float":
      return formatFloat(v);
    case "string":
      return v;
    case "key":
      return v;
    case "vector":
      return formatVector(v);
    case "rotation":
      return formatRotation(v);
    case "list":
      return formatList(v);
    case "void":
      return "";
  }
}
function parseLslInteger(s) {
  let i = 0;
  while (i < s.length && /\s/.test(s[i]))
    i++;
  let sign = 1;
  if (s[i] === "+")
    i++;
  else if (s[i] === "-") {
    sign = -1;
    i++;
  }
  if (s[i] === "0" && (s[i + 1] === "x" || s[i + 1] === "X")) {
    i += 2;
    let hex = "";
    while (i < s.length && /[0-9a-fA-F]/.test(s[i])) {
      hex += s[i];
      i++;
    }
    if (!hex)
      return 0;
    return toInt32(sign * Number.parseInt(hex, 16));
  }
  let dec = "";
  while (i < s.length && /[0-9]/.test(s[i])) {
    dec += s[i];
    i++;
  }
  if (!dec)
    return 0;
  return toInt32(sign * Number.parseInt(dec, 10));
}
function parseLslFloat(s) {
  let i = 0;
  while (i < s.length && /\s/.test(s[i]))
    i++;
  const start = i;
  if (s[i] === "+" || s[i] === "-")
    i++;
  while (i < s.length && /[0-9]/.test(s[i]))
    i++;
  if (s[i] === ".") {
    i++;
    while (i < s.length && /[0-9]/.test(s[i]))
      i++;
  }
  if (s[i] === "e" || s[i] === "E") {
    i++;
    if (s[i] === "+" || s[i] === "-")
      i++;
    while (i < s.length && /[0-9]/.test(s[i]))
      i++;
  }
  if (i === start)
    return 0;
  const n = Number.parseFloat(s.slice(start, i));
  return Number.isFinite(n) ? n : 0;
}
function parseLslVector(s) {
  const m = s.match(/^\s*<\s*([^,]+),\s*([^,]+),\s*([^>]+)\s*>\s*$/);
  if (!m)
    return ZERO_VECTOR;
  const [, xs, ys, zs] = m;
  return {
    x: parseLslFloat(xs),
    y: parseLslFloat(ys),
    z: parseLslFloat(zs)
  };
}
function parseLslRotation(s) {
  const m = s.match(/^\s*<\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^>]+)\s*>\s*$/);
  if (!m)
    return ZERO_ROTATION;
  const [, xs, ys, zs, ss] = m;
  return {
    x: parseLslFloat(xs),
    y: parseLslFloat(ys),
    z: parseLslFloat(zs),
    s: parseLslFloat(ss)
  };
}

// packages/vm/dist/values/ops.js
function applyUnary(op, arg) {
  switch (op) {
    case "+":
      if (arg.type === "integer" || arg.type === "float")
        return arg;
      if (isVector(arg.value) || isRotation(arg.value))
        return arg;
      throw new Error(`unary '+' not defined for ${arg.type}`);
    case "-":
      if (arg.type === "integer")
        return { type: "integer", value: toInt32(-arg.value) };
      if (arg.type === "float")
        return { type: "float", value: -arg.value };
      if (isVector(arg.value)) {
        const v = arg.value;
        return { type: "vector", value: vec(-v.x, -v.y, -v.z) };
      }
      if (isRotation(arg.value)) {
        const r = arg.value;
        return { type: "rotation", value: rot(-r.x, -r.y, -r.z, -r.s) };
      }
      throw new Error(`unary '-' not defined for ${arg.type}`);
    case "!":
      return { type: "integer", value: truthy(arg) ? 0 : 1 };
    case "~":
      if (arg.type === "integer")
        return { type: "integer", value: toInt32(~arg.value) };
      throw new Error(`unary '~' not defined for ${arg.type}`);
  }
}
function truthy(r) {
  switch (r.type) {
    case "integer":
    case "float":
      return r.value !== 0;
    case "string":
      return r.value.length > 0;
    case "key":
      return isValidUuid(r.value);
    case "vector":
      return !isVectorZero(r.value);
    case "rotation": {
      const q = r.value;
      return q.x !== 0 || q.y !== 0 || q.z !== 0 || q.s !== 1;
    }
    case "list":
      return r.value.length > 0;
    case "void":
      return false;
  }
}
function isValidUuid(k) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(k) && k !== NULL_KEY;
}
function isVectorZero(v) {
  return v.x === 0 && v.y === 0 && v.z === 0;
}
function applyBinary(op, left, right) {
  switch (op) {
    case "+":
      return opAdd(left, right);
    case "-":
      return opSub(left, right);
    case "*":
      return opMul(left, right);
    case "/":
      return opDiv(left, right);
    case "%":
      return opMod(left, right);
    case "<<":
      return intBinary(left, right, (a, b) => toInt32(a << (b & 31)));
    case ">>":
      return intBinary(left, right, (a, b) => toInt32(a >> (b & 31)));
    case "&":
      return intBinary(left, right, (a, b) => toInt32(a & b));
    case "^":
      return intBinary(left, right, (a, b) => toInt32(a ^ b));
    case "|":
      return intBinary(left, right, (a, b) => toInt32(a | b));
    case "&&":
      return { type: "integer", value: truthy(left) && truthy(right) ? 1 : 0 };
    case "||":
      return { type: "integer", value: truthy(left) || truthy(right) ? 1 : 0 };
    case "<":
    case ">":
    case "<=":
    case ">=":
      return numericCompare(op, left, right);
    case "==":
      return { type: "integer", value: lslEquals(left, right) ? 1 : 0 };
    case "!=":
      return { type: "integer", value: lslEquals(left, right) ? 0 : 1 };
  }
}
function intBinary(left, right, fn) {
  const a = coerce(left, "integer").value;
  const b = coerce(right, "integer").value;
  return { type: "integer", value: fn(a, b) };
}
function numericCompare(op, left, right) {
  const promoted = promoteNumeric(left, right);
  if (!promoted)
    throw new Error(`cannot compare ${left.type} and ${right.type}`);
  const [a, b] = promoted;
  let result;
  switch (op) {
    case "<":
      result = a.value < b.value;
      break;
    case ">":
      result = a.value > b.value;
      break;
    case "<=":
      result = a.value <= b.value;
      break;
    case ">=":
      result = a.value >= b.value;
      break;
  }
  return { type: "integer", value: result ? 1 : 0 };
}
function promoteNumeric(a, b) {
  const aN = a.type === "integer" || a.type === "float";
  const bN = b.type === "integer" || b.type === "float";
  if (!aN || !bN)
    return null;
  if (a.type === "float" || b.type === "float") {
    return [coerce(a, "float"), coerce(b, "float")];
  }
  return [a, b];
}
function lslEquals(a, b) {
  if ((a.type === "string" || a.type === "key") && (b.type === "string" || b.type === "key")) {
    return a.value === b.value;
  }
  if ((a.type === "integer" || a.type === "float") && (b.type === "integer" || b.type === "float")) {
    return a.value === b.value;
  }
  if (isVector(a.value) && isVector(b.value)) {
    return a.value.x === b.value.x && a.value.y === b.value.y && a.value.z === b.value.z;
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return a.value.x === b.value.x && a.value.y === b.value.y && a.value.z === b.value.z && a.value.s === b.value.s;
  }
  if (a.type === "list" && b.type === "list") {
    return a.value.length === b.value.length;
  }
  return false;
}
function opAdd(a, b) {
  if (a.type === "string" && b.type === "string") {
    return { type: "string", value: a.value + b.value };
  }
  if (a.type === "list" || b.type === "list") {
    const left = a.type === "list" ? a.value : [a.value];
    const right = b.type === "list" ? b.value : [b.value];
    return { type: "list", value: [...left, ...right] };
  }
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: "vector",
      value: vec(a.value.x + b.value.x, a.value.y + b.value.y, a.value.z + b.value.z)
    };
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return {
      type: "rotation",
      value: rot(a.value.x + b.value.x, a.value.y + b.value.y, a.value.z + b.value.z, a.value.s + b.value.s)
    };
  }
  const p = promoteNumeric(a, b);
  if (p) {
    const [x, y] = p;
    if (x.type === "integer")
      return { type: "integer", value: toInt32(x.value + y.value) };
    return { type: "float", value: x.value + y.value };
  }
  throw new Error(`cannot add ${a.type} and ${b.type}`);
}
function opSub(a, b) {
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: "vector",
      value: vec(a.value.x - b.value.x, a.value.y - b.value.y, a.value.z - b.value.z)
    };
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return {
      type: "rotation",
      value: rot(a.value.x - b.value.x, a.value.y - b.value.y, a.value.z - b.value.z, a.value.s - b.value.s)
    };
  }
  const p = promoteNumeric(a, b);
  if (p) {
    const [x, y] = p;
    if (x.type === "integer")
      return { type: "integer", value: toInt32(x.value - y.value) };
    return { type: "float", value: x.value - y.value };
  }
  throw new Error(`cannot subtract ${b.type} from ${a.type}`);
}
function opMul(a, b) {
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: "float",
      value: a.value.x * b.value.x + a.value.y * b.value.y + a.value.z * b.value.z
    };
  }
  if (isVector(a.value) && (b.type === "integer" || b.type === "float")) {
    const k = b.value;
    return { type: "vector", value: vec(a.value.x * k, a.value.y * k, a.value.z * k) };
  }
  if ((a.type === "integer" || a.type === "float") && isVector(b.value)) {
    const k = a.value;
    return { type: "vector", value: vec(b.value.x * k, b.value.y * k, b.value.z * k) };
  }
  if (isVector(a.value) && isRotation(b.value)) {
    return { type: "vector", value: rotateVector(a.value, b.value) };
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return { type: "rotation", value: mulRotation(a.value, b.value) };
  }
  const p = promoteNumeric(a, b);
  if (p) {
    const [x, y] = p;
    if (x.type === "integer")
      return { type: "integer", value: toInt32(Math.imul(x.value, y.value)) };
    return { type: "float", value: x.value * y.value };
  }
  throw new Error(`cannot multiply ${a.type} and ${b.type}`);
}
function opDiv(a, b) {
  if (isVector(a.value) && (b.type === "integer" || b.type === "float")) {
    const k = b.value;
    if (k === 0)
      throw new Error("Math Error: divide by zero");
    return { type: "vector", value: vec(a.value.x / k, a.value.y / k, a.value.z / k) };
  }
  if (isVector(a.value) && isRotation(b.value)) {
    return { type: "vector", value: rotateVector(a.value, conjugate(b.value)) };
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return { type: "rotation", value: mulRotation(a.value, conjugate(b.value)) };
  }
  const p = promoteNumeric(a, b);
  if (p) {
    const [x, y] = p;
    if (x.type === "integer") {
      if (y.value === 0)
        throw new Error("Math Error: divide by zero");
      return {
        type: "integer",
        value: toInt32(Math.trunc(x.value / y.value))
      };
    }
    if (y.value === 0)
      throw new Error("Math Error: divide by zero");
    return { type: "float", value: x.value / y.value };
  }
  throw new Error(`cannot divide ${a.type} by ${b.type}`);
}
function opMod(a, b) {
  if (isVector(a.value) && isVector(b.value)) {
    const u = a.value;
    const v = b.value;
    return {
      type: "vector",
      value: vec(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x)
    };
  }
  if ((a.type === "integer" || a.type === "float") && (b.type === "integer" || b.type === "float")) {
    const x = coerce(a, "integer").value;
    const y = coerce(b, "integer").value;
    if (y === 0)
      throw new Error("Math Error: modulo by zero");
    return { type: "integer", value: toInt32(x % y) };
  }
  throw new Error(`cannot modulo ${a.type} and ${b.type}`);
}
function mulRotation(a, b) {
  return rot(a.s * b.x + a.x * b.s + a.y * b.z - a.z * b.y, a.s * b.y - a.x * b.z + a.y * b.s + a.z * b.x, a.s * b.z + a.x * b.y - a.y * b.x + a.z * b.s, a.s * b.s - a.x * b.x - a.y * b.y - a.z * b.z);
}
function conjugate(q) {
  return rot(-q.x, -q.y, -q.z, q.s);
}
function rotateVector(v, q) {
  const qv = rot(v.x, v.y, v.z, 0);
  const r = mulRotation(mulRotation(q, qv), conjugate(q));
  return vec(r.x, r.y, r.z);
}
function reduceCompound(op, left, right) {
  const binOp = op.slice(0, -1);
  const result = applyBinary(binOp, left, right);
  return coerce(result, left.type);
}

// packages/vm/dist/env.js
var Env = class _Env {
  parent;
  slots = /* @__PURE__ */ new Map();
  constructor(parent = null) {
    this.parent = parent;
  }
  /** Declare a new variable in the current scope. Coerces init to declared type. */
  declare(name, type, init) {
    if (this.slots.has(name)) {
      throw new Error(`variable '${name}' already declared in this scope`);
    }
    const value = init ? coerce(init, type) : defaultEvalFor(type);
    this.slots.set(name, { type, value });
  }
  /**
   * Declare-or-reset: like `declare`, but if `name` already exists in this
   * scope, overwrite its value (and type) instead of throwing. Used by the
   * interpreter when a backward `jump` re-executes a VariableDeclaration —
   * the slot already exists from the first pass and the declaration is
   * effectively a re-initialization. The execBlock pre-scan still catches
   * real source-level duplicate declarations.
   */
  declareOrReset(name, type, init) {
    const slot = this.slots.get(name);
    if (slot) {
      slot.type = type;
      slot.value = init ? coerce(init, type) : defaultEvalFor(type);
      return;
    }
    this.declare(name, type, init);
  }
  /** Get a variable's current value. Walks up the parent chain. */
  get(name) {
    const slot = this.findSlot(name);
    if (!slot)
      throw new Error(`undefined variable '${name}'`);
    return slot.value;
  }
  /** Assign to an existing variable. Coerces to declared type. */
  set(name, value) {
    const slot = this.findSlot(name);
    if (!slot)
      throw new Error(`undefined variable '${name}'`);
    slot.value = coerce(value, slot.type);
    return slot.value;
  }
  hasOwn(name) {
    return this.slots.has(name);
  }
  /** Drop every slot in *this* scope; doesn't touch the parent chain. */
  clear() {
    this.slots.clear();
  }
  /** Open a child scope. */
  push() {
    return new _Env(this);
  }
  findSlot(name) {
    let env = this;
    while (env) {
      const s = env.slots.get(name);
      if (s)
        return s;
      env = env.parent;
    }
    return null;
  }
};

// packages/vm/dist/interpreter.js
var ReturnSignal = class {
  value;
  constructor(value) {
    this.value = value;
  }
};
var JumpSignal = class {
  label;
  constructor(label) {
    this.label = label;
  }
};
var StateChangeSignal = class {
  target;
  constructor(target) {
    this.target = target;
  }
};
function execHandler(ctx, handler, args = []) {
  if (ctx.state.coverage) {
    ctx.state.coverage.hitFunction(handler.loc);
    ctx.state.coverage.hitStatement(handler.body.loc);
  }
  const env = ctx.globals.push();
  handler.params.forEach((p, i) => {
    const a = args[i] ?? defaultEvalFor(p.typeName);
    env.declare(p.name, p.typeName, a);
  });
  try {
    execBlock(ctx, env, handler.body);
  } catch (e) {
    if (e instanceof ReturnSignal)
      return;
    throw e;
  }
}
function callUserFunction(ctx, fn, args) {
  if (ctx.state.coverage) {
    ctx.state.coverage.hitFunction(fn.loc);
    ctx.state.coverage.hitStatement(fn.body.loc);
  }
  const env = ctx.globals.push();
  fn.params.forEach((p, i) => {
    const a = args[i] ?? defaultEvalFor(p.typeName);
    env.declare(p.name, p.typeName, a);
  });
  try {
    execBlock(ctx, env, fn.body);
  } catch (e) {
    if (e instanceof ReturnSignal) {
      if (fn.returnType === null)
        return { type: "void", value: 0 };
      return e.value ? coerce(e.value, fn.returnType) : defaultEvalFor(fn.returnType);
    }
    if (e instanceof JumpSignal) {
      throw new Error(`jump to undefined label '${e.label}' in function '${fn.name}'`);
    }
    throw e;
  }
  return fn.returnType ? defaultEvalFor(fn.returnType) : { type: "void", value: 0 };
}
function execBlock(ctx, env, block) {
  const child = env.push();
  let labels = null;
  const declaredNames = /* @__PURE__ */ new Set();
  for (let i2 = 0; i2 < block.body.length; i2++) {
    const s = block.body[i2];
    if (s.kind === "LabelStatement") {
      if (!labels)
        labels = /* @__PURE__ */ new Map();
      labels.set(s.name, i2);
    } else if (s.kind === "VariableDeclaration") {
      if (declaredNames.has(s.name)) {
        throw new Error(`duplicate declaration of '${s.name}' in block`);
      }
      declaredNames.add(s.name);
    }
  }
  let i = 0;
  while (i < block.body.length) {
    const stmt = block.body[i];
    try {
      execStatement(ctx, child, stmt);
      i++;
    } catch (e) {
      if (e instanceof JumpSignal && labels && labels.has(e.label)) {
        i = labels.get(e.label) + 1;
        continue;
      }
      throw e;
    }
  }
}
function execStatement(ctx, env, stmt) {
  if (ctx.state.coverage)
    ctx.state.coverage.hitStatement(stmt.loc);
  switch (stmt.kind) {
    case "BlockStatement":
      execBlock(ctx, env, stmt);
      return;
    case "VariableDeclaration":
      execVariableDeclaration(ctx, env, stmt);
      return;
    case "ExpressionStatement":
      evalExpression(ctx, env, stmt.expression);
      return;
    case "IfStatement":
      execIf(ctx, env, stmt);
      return;
    case "WhileStatement":
      execWhile(ctx, env, stmt);
      return;
    case "DoWhileStatement":
      execDoWhile(ctx, env, stmt);
      return;
    case "ForStatement":
      execFor(ctx, env, stmt);
      return;
    case "ReturnStatement": {
      const value = stmt.argument ? evalExpression(ctx, env, stmt.argument) : null;
      throw new ReturnSignal(value);
    }
    case "StateChangeStatement":
      throw new StateChangeSignal(stmt.target);
    case "JumpStatement":
      throw new JumpSignal(stmt.label);
    case "LabelStatement":
      return;
  }
}
function execVariableDeclaration(ctx, env, stmt) {
  const init = stmt.init ? evalExpression(ctx, env, stmt.init) : void 0;
  env.declareOrReset(stmt.name, stmt.typeName, init);
}
function execIf(ctx, env, stmt) {
  const cov = ctx.state.coverage;
  if (truthy(evalExpression(ctx, env, stmt.test))) {
    if (cov)
      cov.hitBranch(stmt.loc, true);
    execStatement(ctx, env, stmt.consequent);
  } else {
    if (cov)
      cov.hitBranch(stmt.loc, false);
    if (stmt.alternate)
      execStatement(ctx, env, stmt.alternate);
  }
}
function execWhile(ctx, env, stmt) {
  const cov = ctx.state.coverage;
  while (true) {
    const t = truthy(evalExpression(ctx, env, stmt.test));
    if (cov)
      cov.hitBranch(stmt.loc, t);
    if (!t)
      break;
    execStatement(ctx, env, stmt.body);
  }
}
function execDoWhile(ctx, env, stmt) {
  const cov = ctx.state.coverage;
  while (true) {
    execStatement(ctx, env, stmt.body);
    const t = truthy(evalExpression(ctx, env, stmt.test));
    if (cov)
      cov.hitBranch(stmt.loc, t);
    if (!t)
      break;
  }
}
function execFor(ctx, env, stmt) {
  const child = env.push();
  const cov = ctx.state.coverage;
  for (const e of stmt.init)
    evalExpression(ctx, child, e);
  while (true) {
    if (stmt.test) {
      const t = truthy(evalExpression(ctx, child, stmt.test));
      if (cov)
        cov.hitBranch(stmt.loc, t);
      if (!t)
        break;
    } else if (cov) {
      cov.hitBranch(stmt.loc, true);
    }
    execStatement(ctx, child, stmt.body);
    for (const e of stmt.update)
      evalExpression(ctx, child, e);
  }
}
function evalExpression(ctx, env, expr) {
  switch (expr.kind) {
    case "IntegerLiteral":
      return { type: "integer", value: expr.value | 0 };
    case "FloatLiteral":
      return { type: "float", value: expr.value };
    case "StringLiteral":
      return { type: "string", value: expr.value };
    case "VectorLiteral":
      return evalVectorLiteral(ctx, env, expr);
    case "RotationLiteral":
      return evalRotationLiteral(ctx, env, expr);
    case "ListLiteral":
      return evalListLiteral(ctx, env, expr);
    case "Identifier":
      return env.get(expr.name);
    case "CallExpression":
      return evalCall(ctx, env, expr);
    case "UnaryExpression":
      return applyUnary(expr.operator, evalExpression(ctx, env, expr.argument));
    case "BinaryExpression":
      return evalBinary(ctx, env, expr);
    case "AssignmentExpression":
      return evalAssignment(ctx, env, expr);
    case "CastExpression":
      return coerce(evalExpression(ctx, env, expr.argument), expr.targetType);
    case "MemberExpression":
      return evalMember(ctx, env, expr);
    case "UpdateExpression":
      return evalUpdate(ctx, env, expr);
  }
}
function evalVectorLiteral(ctx, env, e) {
  const x = coerce(evalExpression(ctx, env, e.x), "float").value;
  const y = coerce(evalExpression(ctx, env, e.y), "float").value;
  const z = coerce(evalExpression(ctx, env, e.z), "float").value;
  return { type: "vector", value: { x, y, z } };
}
function evalRotationLiteral(ctx, env, e) {
  const x = coerce(evalExpression(ctx, env, e.x), "float").value;
  const y = coerce(evalExpression(ctx, env, e.y), "float").value;
  const z = coerce(evalExpression(ctx, env, e.z), "float").value;
  const s = coerce(evalExpression(ctx, env, e.s), "float").value;
  return { type: "rotation", value: { x, y, z, s } };
}
function evalListLiteral(ctx, env, e) {
  const elements = e.elements.map((el) => evalExpression(ctx, env, el).value);
  return { type: "list", value: elements };
}
function evalBinary(ctx, env, e) {
  const left = evalExpression(ctx, env, e.left);
  const right = evalExpression(ctx, env, e.right);
  return applyBinary(e.operator, left, right);
}
function evalAssignment(ctx, env, e) {
  const newValue = evalExpression(ctx, env, e.value);
  return assignTo(ctx, env, e.target, e.operator, newValue);
}
function assignTo(ctx, env, target, op, rhs) {
  if (target.kind === "Identifier") {
    if (op === "=")
      return env.set(target.name, rhs);
    const current = env.get(target.name);
    return env.set(target.name, reduceCompound(op, current, rhs));
  }
  if (target.kind === "MemberExpression") {
    return assignToMember(ctx, env, target, op, rhs);
  }
  throw new Error(`invalid assignment target: ${target.kind}`);
}
function assignToMember(ctx, env, target, op, rhs) {
  if (target.object.kind !== "Identifier") {
    throw new Error("member assignment supported only on identifier targets");
  }
  const current = env.get(target.object.name);
  if (!isVector(current.value) && !isRotation(current.value)) {
    throw new Error(`cannot access member on ${current.type}`);
  }
  const obj = current.value;
  const member = target.property;
  if (!["x", "y", "z", "s"].includes(member)) {
    throw new Error(`unknown member '${member}' (expected x|y|z|s)`);
  }
  if (member === "s" && !isRotation(obj)) {
    throw new Error(`vector has no '.s' component`);
  }
  const oldField = {
    type: "float",
    value: obj[member]
  };
  const newField = op === "=" ? coerce(rhs, "float") : reduceCompound(op, oldField, rhs);
  const updated = { ...obj, [member]: newField.value };
  const wrapped = isRotation(obj) ? {
    type: "rotation",
    value: {
      x: updated.x,
      y: updated.y,
      z: updated.z,
      s: updated.s
    }
  } : {
    type: "vector",
    value: { x: updated.x, y: updated.y, z: updated.z }
  };
  env.set(target.object.name, wrapped);
  return newField;
}
function evalMember(ctx, env, e) {
  const obj = evalExpression(ctx, env, e.object);
  if (!isVector(obj.value) && !isRotation(obj.value)) {
    throw new Error(`cannot access member on ${obj.type}`);
  }
  const v = obj.value;
  const member = e.property;
  if (member === "s" && !isRotation(v)) {
    throw new Error(`vector has no '.s' component`);
  }
  if (!["x", "y", "z", "s"].includes(member)) {
    throw new Error(`unknown member '${member}' (expected x|y|z|s)`);
  }
  return { type: "float", value: v[member] };
}
function evalUpdate(ctx, env, e) {
  if (e.argument.kind !== "Identifier" && e.argument.kind !== "MemberExpression") {
    throw new Error("++/-- only valid on identifiers or member expressions");
  }
  const current = evalExpression(ctx, env, e.argument);
  const delta = { type: "integer", value: e.operator === "++" ? 1 : -1 };
  const updated = reduceCompound("+=", current, delta);
  assignTo(ctx, env, e.argument, "=", updated);
  return e.prefix ? updated : current;
}
function evalCall(ctx, env, call) {
  const evalArgs = call.args.map((a) => evalExpression(ctx, env, a));
  const userFn = ctx.userFunctions.get(call.callee);
  if (userFn) {
    return callUserFunction(ctx, userFn, evalArgs);
  }
  const rawArgs = evalArgs.map((r) => r.value);
  const result = callBuiltin({ state: ctx.state, mocks: ctx.mocks, script: ctx.script }, call.callee, rawArgs);
  const spec = specFor(call.callee);
  const returnType = spec?.returnType ?? "void";
  if (returnType === "void")
    return { type: "void", value: 0 };
  return { type: returnType, value: result ?? defaultEvalFor(returnType).value };
}

// packages/vm/dist/coverage.js
function buildCoveragePlan(ast, filename, source) {
  const statements = [];
  const branches = [];
  const functions = [];
  const states = [];
  const walkStatement = (s) => {
    statements.push({
      id: s.loc.offset,
      line: s.loc.line,
      col: s.loc.col,
      kind: s.kind
    });
    switch (s.kind) {
      case "BlockStatement":
        for (const inner of s.body)
          walkStatement(inner);
        return;
      case "IfStatement":
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: "if",
          hasElse: s.alternate !== null
        });
        walkStatement(s.consequent);
        if (s.alternate)
          walkStatement(s.alternate);
        return;
      case "WhileStatement":
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: "while",
          hasElse: false
        });
        walkStatement(s.body);
        return;
      case "DoWhileStatement":
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: "do-while",
          hasElse: false
        });
        walkStatement(s.body);
        return;
      case "ForStatement":
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: "for",
          hasElse: false
        });
        walkStatement(s.body);
        return;
      default:
        return;
    }
  };
  for (const fn of ast.functions) {
    functions.push({
      id: fn.loc.offset,
      name: fn.name,
      line: fn.loc.line,
      col: fn.loc.col,
      kind: "function"
    });
    walkStatement(fn.body);
  }
  for (const state of ast.states) {
    states.push({
      id: state.loc.offset,
      name: state.name,
      line: state.loc.line,
      col: state.loc.col
    });
    for (const handler of state.handlers) {
      functions.push({
        id: handler.loc.offset,
        name: handler.name,
        line: handler.loc.line,
        col: handler.loc.col,
        kind: "event",
        state: state.name
      });
      walkStatement(handler.body);
    }
  }
  return { filename, source, statements, branches, functions, states };
}
var CoverageCollector = class {
  plan;
  statementHits = /* @__PURE__ */ new Map();
  branchHits = /* @__PURE__ */ new Map();
  functionHits = /* @__PURE__ */ new Map();
  stateHits = /* @__PURE__ */ new Map();
  constructor(plan) {
    this.plan = plan;
    for (const b of plan.branches) {
      this.branchHits.set(b.id, [0, 0]);
    }
  }
  hitStatement(loc) {
    const id = loc.offset;
    this.statementHits.set(id, (this.statementHits.get(id) ?? 0) + 1);
  }
  hitBranch(loc, taken) {
    const pair = this.branchHits.get(loc.offset);
    if (!pair)
      return;
    if (taken)
      pair[0]++;
    else
      pair[1]++;
  }
  hitFunction(loc) {
    const id = loc.offset;
    this.functionHits.set(id, (this.functionHits.get(id) ?? 0) + 1);
  }
  hitState(name) {
    this.stateHits.set(name, (this.stateHits.get(name) ?? 0) + 1);
  }
  /** Frozen snapshot suitable for serialization or assertions. */
  snapshot() {
    const statements = this.plan.statements.map((s) => ({
      ...s,
      hits: this.statementHits.get(s.id) ?? 0
    }));
    const branches = this.plan.branches.map((b) => {
      const pair = this.branchHits.get(b.id) ?? [0, 0];
      return { ...b, hits: [pair[0], pair[1]] };
    });
    const functions = this.plan.functions.map((f) => ({
      ...f,
      hits: this.functionHits.get(f.id) ?? 0
    }));
    const states = this.plan.states.map((s) => ({
      ...s,
      hits: this.stateHits.get(s.name) ?? 0
    }));
    return {
      filename: this.plan.filename,
      source: this.plan.source,
      statements,
      branches,
      functions,
      states
    };
  }
};
function mergeReports(reports) {
  if (reports.length === 0) {
    throw new Error("mergeReports: empty input");
  }
  const head = reports[0];
  for (const r of reports) {
    if (r.filename !== head.filename) {
      throw new Error(`mergeReports: filename mismatch ${head.filename} vs ${r.filename}`);
    }
    if (r.statements.length !== head.statements.length || r.branches.length !== head.branches.length || r.functions.length !== head.functions.length || r.states.length !== head.states.length) {
      throw new Error(`mergeReports: plan size mismatch for ${head.filename}`);
    }
  }
  const statements = head.statements.map((s, i) => ({
    ...s,
    hits: reports.reduce((acc, r) => acc + r.statements[i].hits, 0)
  }));
  const branches = head.branches.map((b, i) => {
    let t = 0;
    let f = 0;
    for (const r of reports) {
      t += r.branches[i].hits[0];
      f += r.branches[i].hits[1];
    }
    return { ...b, hits: [t, f] };
  });
  const functions = head.functions.map((fn, i) => ({
    ...fn,
    hits: reports.reduce((acc, r) => acc + r.functions[i].hits, 0)
  }));
  const states = head.states.map((s, i) => ({
    ...s,
    hits: reports.reduce((acc, r) => acc + r.states[i].hits, 0)
  }));
  return {
    filename: head.filename,
    source: head.source,
    statements,
    branches,
    functions,
    states
  };
}

// packages/vm/dist/generated/events.js
var EVENT_SPECS = {
  "at_rot_target": { name: "at_rot_target", params: [{ name: "tnum", type: "integer" }, { name: "targetrot", type: "rotation" }, { name: "ourrot", type: "rotation" }] },
  "at_target": { name: "at_target", params: [{ name: "tnum", type: "integer" }, { name: "targetpos", type: "vector" }, { name: "ourpos", type: "vector" }] },
  "attach": { name: "attach", params: [{ name: "id", type: "key" }] },
  "changed": { name: "changed", params: [{ name: "change", type: "integer" }] },
  "collision": { name: "collision", params: [{ name: "num_detected", type: "integer" }] },
  "collision_end": { name: "collision_end", params: [{ name: "num_detected", type: "integer" }] },
  "collision_start": { name: "collision_start", params: [{ name: "num_detected", type: "integer" }] },
  "control": { name: "control", params: [{ name: "id", type: "key" }, { name: "level", type: "integer" }, { name: "edge", type: "integer" }] },
  "dataserver": { name: "dataserver", params: [{ name: "queryid", type: "key" }, { name: "data", type: "string" }] },
  "email": { name: "email", params: [{ name: "time", type: "string" }, { name: "address", type: "string" }, { name: "subj", type: "string" }, { name: "message", type: "string" }, { name: "num_left", type: "integer" }] },
  "experience_permissions": { name: "experience_permissions", params: [{ name: "agent", type: "key" }] },
  "experience_permissions_denied": { name: "experience_permissions_denied", params: [{ name: "agent", type: "key" }, { name: "reason", type: "integer" }] },
  "final_damage": { name: "final_damage", params: [{ name: "num_detected", type: "integer" }] },
  "game_control": { name: "game_control", params: [{ name: "id", type: "key" }, { name: "button_states", type: "integer" }, { name: "axis_values", type: "list" }] },
  "http_request": { name: "http_request", params: [{ name: "id", type: "key" }, { name: "method", type: "string" }, { name: "body", type: "string" }] },
  "http_response": { name: "http_response", params: [{ name: "request_id", type: "key" }, { name: "status", type: "integer" }, { name: "metadata", type: "list" }, { name: "body", type: "string" }] },
  "land_collision": { name: "land_collision", params: [{ name: "pos", type: "vector" }] },
  "land_collision_end": { name: "land_collision_end", params: [{ name: "pos", type: "vector" }] },
  "land_collision_start": { name: "land_collision_start", params: [{ name: "pos", type: "vector" }] },
  "link_message": { name: "link_message", params: [{ name: "sender_num", type: "integer" }, { name: "num", type: "integer" }, { name: "str", type: "string" }, { name: "id", type: "key" }] },
  "linkset_data": { name: "linkset_data", params: [{ name: "action", type: "integer" }, { name: "name", type: "string" }, { name: "value", type: "string" }] },
  "listen": { name: "listen", params: [{ name: "channel", type: "integer" }, { name: "name", type: "string" }, { name: "id", type: "key" }, { name: "message", type: "string" }] },
  "money": { name: "money", params: [{ name: "id", type: "key" }, { name: "amount", type: "integer" }] },
  "moving_end": { name: "moving_end", params: [] },
  "moving_start": { name: "moving_start", params: [] },
  "no_sensor": { name: "no_sensor", params: [] },
  "not_at_rot_target": { name: "not_at_rot_target", params: [] },
  "not_at_target": { name: "not_at_target", params: [] },
  "object_rez": { name: "object_rez", params: [{ name: "id", type: "key" }] },
  "on_damage": { name: "on_damage", params: [{ name: "num_detected", type: "integer" }] },
  "on_death": { name: "on_death", params: [] },
  "on_rez": { name: "on_rez", params: [{ name: "start_param", type: "integer" }] },
  "path_update": { name: "path_update", params: [{ name: "type", type: "integer" }, { name: "reserved", type: "list" }] },
  "remote_data": { name: "remote_data", params: [{ name: "event_type", type: "integer" }, { name: "channel", type: "key" }, { name: "message_id", type: "key" }, { name: "sender", type: "string" }, { name: "idata", type: "integer" }, { name: "sdata", type: "string" }] },
  "run_time_permissions": { name: "run_time_permissions", params: [{ name: "perm", type: "integer" }] },
  "sensor": { name: "sensor", params: [{ name: "num_detected", type: "integer" }] },
  "state_entry": { name: "state_entry", params: [] },
  "state_exit": { name: "state_exit", params: [] },
  "timer": { name: "timer", params: [] },
  "touch": { name: "touch", params: [{ name: "num_detected", type: "integer" }] },
  "touch_end": { name: "touch_end", params: [{ name: "num_detected", type: "integer" }] },
  "touch_start": { name: "touch_start", params: [{ name: "num_detected", type: "integer" }] },
  "transaction_result": { name: "transaction_result", params: [{ name: "id", type: "key" }, { name: "success", type: "integer" }, { name: "data", type: "string" }] }
};

// packages/vm/dist/generated/constants_table.js
var CONSTANT_TABLE = {
  "ACTIVE": { type: "integer", value: 2 },
  "AGENT": { type: "integer", value: 1 },
  "AGENT_ALWAYS_RUN": { type: "integer", value: 4096 },
  "AGENT_ATTACHMENTS": { type: "integer", value: 2 },
  "AGENT_AUTOMATED": { type: "integer", value: 16384 },
  "AGENT_AUTOPILOT": { type: "integer", value: 8192 },
  "AGENT_AWAY": { type: "integer", value: 64 },
  "AGENT_BUSY": { type: "integer", value: 2048 },
  "AGENT_BY_LEGACY_NAME": { type: "integer", value: 1 },
  "AGENT_BY_USERNAME": { type: "integer", value: 16 },
  "AGENT_CROUCHING": { type: "integer", value: 1024 },
  "AGENT_FLOATING_VIA_SCRIPTED_ATTACHMENT": { type: "integer", value: 32768 },
  "AGENT_FLYING": { type: "integer", value: 1 },
  "AGENT_IN_AIR": { type: "integer", value: 256 },
  "AGENT_LIST_PARCEL": { type: "integer", value: 1 },
  "AGENT_LIST_PARCEL_OWNER": { type: "integer", value: 2 },
  "AGENT_LIST_REGION": { type: "integer", value: 4 },
  "AGENT_MOUSELOOK": { type: "integer", value: 8 },
  "AGENT_ON_OBJECT": { type: "integer", value: 32 },
  "AGENT_SCRIPTED": { type: "integer", value: 4 },
  "AGENT_SITTING": { type: "integer", value: 16 },
  "AGENT_TYPING": { type: "integer", value: 512 },
  "AGENT_WALKING": { type: "integer", value: 128 },
  "ALL_SIDES": { type: "integer", value: -1 },
  "ANIM_ON": { type: "integer", value: 1 },
  "ATTACH_ANY_HUD": { type: "integer", value: -1 },
  "ATTACH_AVATAR_CENTER": { type: "integer", value: 40 },
  "ATTACH_BACK": { type: "integer", value: 9 },
  "ATTACH_BELLY": { type: "integer", value: 28 },
  "ATTACH_CHEST": { type: "integer", value: 1 },
  "ATTACH_CHIN": { type: "integer", value: 12 },
  "ATTACH_FACE_JAW": { type: "integer", value: 47 },
  "ATTACH_FACE_LEAR": { type: "integer", value: 48 },
  "ATTACH_FACE_LEYE": { type: "integer", value: 50 },
  "ATTACH_FACE_REAR": { type: "integer", value: 49 },
  "ATTACH_FACE_REYE": { type: "integer", value: 51 },
  "ATTACH_FACE_TONGUE": { type: "integer", value: 52 },
  "ATTACH_GROIN": { type: "integer", value: 53 },
  "ATTACH_HEAD": { type: "integer", value: 2 },
  "ATTACH_HIND_LFOOT": { type: "integer", value: 54 },
  "ATTACH_HIND_RFOOT": { type: "integer", value: 55 },
  "ATTACH_HUD_BOTTOM": { type: "integer", value: 37 },
  "ATTACH_HUD_BOTTOM_LEFT": { type: "integer", value: 36 },
  "ATTACH_HUD_BOTTOM_RIGHT": { type: "integer", value: 38 },
  "ATTACH_HUD_CENTER_1": { type: "integer", value: 35 },
  "ATTACH_HUD_CENTER_2": { type: "integer", value: 31 },
  "ATTACH_HUD_TOP_CENTER": { type: "integer", value: 33 },
  "ATTACH_HUD_TOP_LEFT": { type: "integer", value: 34 },
  "ATTACH_HUD_TOP_RIGHT": { type: "integer", value: 32 },
  "ATTACH_LEAR": { type: "integer", value: 13 },
  "ATTACH_LEFT_PEC": { type: "integer", value: 29 },
  "ATTACH_LEYE": { type: "integer", value: 15 },
  "ATTACH_LFOOT": { type: "integer", value: 7 },
  "ATTACH_LHAND": { type: "integer", value: 5 },
  "ATTACH_LHAND_RING1": { type: "integer", value: 41 },
  "ATTACH_LHIP": { type: "integer", value: 25 },
  "ATTACH_LLARM": { type: "integer", value: 21 },
  "ATTACH_LLLEG": { type: "integer", value: 27 },
  "ATTACH_LPEC": { type: "integer", value: 30 },
  "ATTACH_LSHOULDER": { type: "integer", value: 3 },
  "ATTACH_LUARM": { type: "integer", value: 20 },
  "ATTACH_LULEG": { type: "integer", value: 26 },
  "ATTACH_LWING": { type: "integer", value: 45 },
  "ATTACH_MOUTH": { type: "integer", value: 11 },
  "ATTACH_NECK": { type: "integer", value: 39 },
  "ATTACH_NOSE": { type: "integer", value: 17 },
  "ATTACH_PELVIS": { type: "integer", value: 10 },
  "ATTACH_REAR": { type: "integer", value: 14 },
  "ATTACH_REYE": { type: "integer", value: 16 },
  "ATTACH_RFOOT": { type: "integer", value: 8 },
  "ATTACH_RHAND": { type: "integer", value: 6 },
  "ATTACH_RHAND_RING1": { type: "integer", value: 42 },
  "ATTACH_RHIP": { type: "integer", value: 22 },
  "ATTACH_RIGHT_PEC": { type: "integer", value: 30 },
  "ATTACH_RLARM": { type: "integer", value: 19 },
  "ATTACH_RLLEG": { type: "integer", value: 24 },
  "ATTACH_RPEC": { type: "integer", value: 29 },
  "ATTACH_RSHOULDER": { type: "integer", value: 4 },
  "ATTACH_RUARM": { type: "integer", value: 18 },
  "ATTACH_RULEG": { type: "integer", value: 23 },
  "ATTACH_RWING": { type: "integer", value: 46 },
  "ATTACH_TAIL_BASE": { type: "integer", value: 43 },
  "ATTACH_TAIL_TIP": { type: "integer", value: 44 },
  "AVOID_CHARACTERS": { type: "integer", value: 1 },
  "AVOID_DYNAMIC_OBSTACLES": { type: "integer", value: 2 },
  "AVOID_NONE": { type: "integer", value: 0 },
  "BEACON_MAP": { type: "integer", value: 1 },
  "CAMERA_ACTIVE": { type: "integer", value: 12 },
  "CAMERA_BEHINDNESS_ANGLE": { type: "integer", value: 8 },
  "CAMERA_BEHINDNESS_LAG": { type: "integer", value: 9 },
  "CAMERA_DISTANCE": { type: "integer", value: 7 },
  "CAMERA_FOCUS": { type: "integer", value: 17 },
  "CAMERA_FOCUS_LAG": { type: "integer", value: 6 },
  "CAMERA_FOCUS_LOCKED": { type: "integer", value: 22 },
  "CAMERA_FOCUS_OFFSET": { type: "integer", value: 1 },
  "CAMERA_FOCUS_THRESHOLD": { type: "integer", value: 11 },
  "CAMERA_PITCH": { type: "integer", value: 0 },
  "CAMERA_POSITION": { type: "integer", value: 13 },
  "CAMERA_POSITION_LAG": { type: "integer", value: 5 },
  "CAMERA_POSITION_LOCKED": { type: "integer", value: 21 },
  "CAMERA_POSITION_THRESHOLD": { type: "integer", value: 10 },
  "CHANGED_ALLOWED_DROP": { type: "integer", value: 64 },
  "CHANGED_COLOR": { type: "integer", value: 2 },
  "CHANGED_INVENTORY": { type: "integer", value: 1 },
  "CHANGED_LINK": { type: "integer", value: 32 },
  "CHANGED_MEDIA": { type: "integer", value: 2048 },
  "CHANGED_OWNER": { type: "integer", value: 128 },
  "CHANGED_REGION": { type: "integer", value: 256 },
  "CHANGED_REGION_START": { type: "integer", value: 1024 },
  "CHANGED_RENDER_MATERIAL": { type: "integer", value: 4096 },
  "CHANGED_SCALE": { type: "integer", value: 8 },
  "CHANGED_SHAPE": { type: "integer", value: 4 },
  "CHANGED_TELEPORT": { type: "integer", value: 512 },
  "CHANGED_TEXTURE": { type: "integer", value: 16 },
  "CHARACTER_ACCOUNT_FOR_SKIPPED_FRAMES": { type: "integer", value: 14 },
  "CHARACTER_AVOIDANCE_MODE": { type: "integer", value: 5 },
  "CHARACTER_CMD_JUMP": { type: "integer", value: 1 },
  "CHARACTER_CMD_SMOOTH_STOP": { type: "integer", value: 2 },
  "CHARACTER_CMD_STOP": { type: "integer", value: 0 },
  "CHARACTER_DESIRED_SPEED": { type: "integer", value: 1 },
  "CHARACTER_DESIRED_TURN_SPEED": { type: "integer", value: 12 },
  "CHARACTER_LENGTH": { type: "integer", value: 3 },
  "CHARACTER_MAX_ACCEL": { type: "integer", value: 8 },
  "CHARACTER_MAX_DECEL": { type: "integer", value: 9 },
  "CHARACTER_MAX_SPEED": { type: "integer", value: 13 },
  "CHARACTER_MAX_TURN_RADIUS": { type: "integer", value: 10 },
  "CHARACTER_ORIENTATION": { type: "integer", value: 4 },
  "CHARACTER_RADIUS": { type: "integer", value: 2 },
  "CHARACTER_STAY_WITHIN_PARCEL": { type: "integer", value: 15 },
  "CHARACTER_TYPE": { type: "integer", value: 6 },
  "CHARACTER_TYPE_A": { type: "integer", value: 0 },
  "CHARACTER_TYPE_B": { type: "integer", value: 1 },
  "CHARACTER_TYPE_C": { type: "integer", value: 2 },
  "CHARACTER_TYPE_D": { type: "integer", value: 3 },
  "CHARACTER_TYPE_NONE": { type: "integer", value: 4 },
  "CLICK_ACTION_BUY": { type: "integer", value: 2 },
  "CLICK_ACTION_DISABLED": { type: "integer", value: 8 },
  "CLICK_ACTION_IGNORE": { type: "integer", value: 9 },
  "CLICK_ACTION_NONE": { type: "integer", value: 0 },
  "CLICK_ACTION_OPEN": { type: "integer", value: 4 },
  "CLICK_ACTION_OPEN_MEDIA": { type: "integer", value: 6 },
  "CLICK_ACTION_PAY": { type: "integer", value: 3 },
  "CLICK_ACTION_PLAY": { type: "integer", value: 5 },
  "CLICK_ACTION_SIT": { type: "integer", value: 1 },
  "CLICK_ACTION_TOUCH": { type: "integer", value: 0 },
  "CLICK_ACTION_ZOOM": { type: "integer", value: 7 },
  "COMBAT_CHANNEL": { type: "integer", value: 2147483646 },
  "COMBAT_LOG_ID": { type: "string", value: "45e0fcfa-2268-4490-a51c-3e51bdfe80d1" },
  "CONTENT_TYPE_ATOM": { type: "integer", value: 4 },
  "CONTENT_TYPE_FORM": { type: "integer", value: 7 },
  "CONTENT_TYPE_HTML": { type: "integer", value: 1 },
  "CONTENT_TYPE_JSON": { type: "integer", value: 5 },
  "CONTENT_TYPE_LLSD": { type: "integer", value: 6 },
  "CONTENT_TYPE_RSS": { type: "integer", value: 8 },
  "CONTENT_TYPE_TEXT": { type: "integer", value: 0 },
  "CONTENT_TYPE_XHTML": { type: "integer", value: 3 },
  "CONTENT_TYPE_XML": { type: "integer", value: 2 },
  "CONTROL_BACK": { type: "integer", value: 2 },
  "CONTROL_DOWN": { type: "integer", value: 32 },
  "CONTROL_FWD": { type: "integer", value: 1 },
  "CONTROL_LBUTTON": { type: "integer", value: 268435456 },
  "CONTROL_LEFT": { type: "integer", value: 4 },
  "CONTROL_ML_LBUTTON": { type: "integer", value: 1073741824 },
  "CONTROL_RIGHT": { type: "integer", value: 8 },
  "CONTROL_ROT_LEFT": { type: "integer", value: 256 },
  "CONTROL_ROT_RIGHT": { type: "integer", value: 512 },
  "CONTROL_UP": { type: "integer", value: 16 },
  "DAMAGEABLE": { type: "integer", value: 32 },
  "DAMAGE_TYPE_ACID": { type: "integer", value: 1 },
  "DAMAGE_TYPE_BLUDGEONING": { type: "integer", value: 2 },
  "DAMAGE_TYPE_COLD": { type: "integer", value: 3 },
  "DAMAGE_TYPE_ELECTRIC": { type: "integer", value: 4 },
  "DAMAGE_TYPE_EMOTIONAL": { type: "integer", value: 14 },
  "DAMAGE_TYPE_FIRE": { type: "integer", value: 5 },
  "DAMAGE_TYPE_FORCE": { type: "integer", value: 6 },
  "DAMAGE_TYPE_GENERIC": { type: "integer", value: 0 },
  "DAMAGE_TYPE_IMPACT": { type: "integer", value: -1 },
  "DAMAGE_TYPE_NECROTIC": { type: "integer", value: 7 },
  "DAMAGE_TYPE_PIERCING": { type: "integer", value: 8 },
  "DAMAGE_TYPE_POISON": { type: "integer", value: 9 },
  "DAMAGE_TYPE_PSYCHIC": { type: "integer", value: 10 },
  "DAMAGE_TYPE_RADIANT": { type: "integer", value: 11 },
  "DAMAGE_TYPE_SLASHING": { type: "integer", value: 12 },
  "DAMAGE_TYPE_SONIC": { type: "integer", value: 13 },
  "DATA_BORN": { type: "integer", value: 3 },
  "DATA_NAME": { type: "integer", value: 2 },
  "DATA_ONLINE": { type: "integer", value: 1 },
  "DATA_PAYINFO": { type: "integer", value: 8 },
  "DATA_RATING": { type: "integer", value: 4 },
  "DATA_SIM_POS": { type: "integer", value: 5 },
  "DATA_SIM_RATING": { type: "integer", value: 7 },
  "DATA_SIM_STATUS": { type: "integer", value: 6 },
  "DEBUG_CHANNEL": { type: "integer", value: 2147483647 },
  "DEG_TO_RAD": { type: "float", value: 0.017453293 },
  "DENSITY": { type: "integer", value: 1 },
  "DEREZ_DIE": { type: "integer", value: 0 },
  "DEREZ_MAKE_TEMP": { type: "integer", value: 1 },
  "ENVIRONMENT_DAYINFO": { type: "integer", value: 200 },
  "ENV_INVALID_AGENT": { type: "integer", value: -4 },
  "ENV_INVALID_RULE": { type: "integer", value: -5 },
  "ENV_NOT_EXPERIENCE": { type: "integer", value: -1 },
  "ENV_NO_ENVIRONMENT": { type: "integer", value: -3 },
  "ENV_NO_EXPERIENCE_LAND": { type: "integer", value: -7 },
  "ENV_NO_EXPERIENCE_PERMISSION": { type: "integer", value: -2 },
  "ENV_NO_PERMISSIONS": { type: "integer", value: -9 },
  "ENV_THROTTLE": { type: "integer", value: -8 },
  "ENV_VALIDATION_FAIL": { type: "integer", value: -6 },
  "EOF": { type: "string", value: "\n\n\n" },
  "ERR_GENERIC": { type: "integer", value: -1 },
  "ERR_MALFORMED_PARAMS": { type: "integer", value: -3 },
  "ERR_PARCEL_PERMISSIONS": { type: "integer", value: -2 },
  "ERR_RUNTIME_PERMISSIONS": { type: "integer", value: -4 },
  "ERR_THROTTLED": { type: "integer", value: -5 },
  "ESTATE_ACCESS_ALLOWED_AGENT_ADD": { type: "integer", value: 4 },
  "ESTATE_ACCESS_ALLOWED_AGENT_REMOVE": { type: "integer", value: 8 },
  "ESTATE_ACCESS_ALLOWED_GROUP_ADD": { type: "integer", value: 16 },
  "ESTATE_ACCESS_ALLOWED_GROUP_REMOVE": { type: "integer", value: 32 },
  "ESTATE_ACCESS_BANNED_AGENT_ADD": { type: "integer", value: 64 },
  "ESTATE_ACCESS_BANNED_AGENT_REMOVE": { type: "integer", value: 128 },
  "FALSE": { type: "integer", value: 0 },
  "FILTER_FLAGS": { type: "integer", value: 2 },
  "FILTER_FLAG_HUDS": { type: "integer", value: 1 },
  "FILTER_INCLUDE": { type: "integer", value: 1 },
  "FORCE_DIRECT_PATH": { type: "integer", value: 1 },
  "FRICTION": { type: "integer", value: 2 },
  "GAME_CONTROL_AXIS_LEFTX": { type: "integer", value: 0 },
  "GAME_CONTROL_AXIS_LEFTY": { type: "integer", value: 1 },
  "GAME_CONTROL_AXIS_RIGHTX": { type: "integer", value: 2 },
  "GAME_CONTROL_AXIS_RIGHTY": { type: "integer", value: 3 },
  "GAME_CONTROL_AXIS_TRIGGERLEFT": { type: "integer", value: 4 },
  "GAME_CONTROL_AXIS_TRIGGERRIGHT": { type: "integer", value: 5 },
  "GAME_CONTROL_BUTTON_A": { type: "integer", value: 1 },
  "GAME_CONTROL_BUTTON_B": { type: "integer", value: 2 },
  "GAME_CONTROL_BUTTON_BACK": { type: "integer", value: 16 },
  "GAME_CONTROL_BUTTON_DPAD_DOWN": { type: "integer", value: 4096 },
  "GAME_CONTROL_BUTTON_DPAD_LEFT": { type: "integer", value: 8192 },
  "GAME_CONTROL_BUTTON_DPAD_RIGHT": { type: "integer", value: 16384 },
  "GAME_CONTROL_BUTTON_DPAD_UP": { type: "integer", value: 2048 },
  "GAME_CONTROL_BUTTON_GUIDE": { type: "integer", value: 32 },
  "GAME_CONTROL_BUTTON_LEFTSHOULDER": { type: "integer", value: 512 },
  "GAME_CONTROL_BUTTON_LEFTSTICK": { type: "integer", value: 128 },
  "GAME_CONTROL_BUTTON_MISC1": { type: "integer", value: 32768 },
  "GAME_CONTROL_BUTTON_PADDLE1": { type: "integer", value: 65536 },
  "GAME_CONTROL_BUTTON_PADDLE2": { type: "integer", value: 131072 },
  "GAME_CONTROL_BUTTON_PADDLE3": { type: "integer", value: 262144 },
  "GAME_CONTROL_BUTTON_PADDLE4": { type: "integer", value: 524288 },
  "GAME_CONTROL_BUTTON_RIGHTSHOULDER": { type: "integer", value: 1024 },
  "GAME_CONTROL_BUTTON_RIGHTSTICK": { type: "integer", value: 256 },
  "GAME_CONTROL_BUTTON_START": { type: "integer", value: 64 },
  "GAME_CONTROL_BUTTON_TOUCHPAD": { type: "integer", value: 1048576 },
  "GAME_CONTROL_BUTTON_X": { type: "integer", value: 4 },
  "GAME_CONTROL_BUTTON_Y": { type: "integer", value: 8 },
  "GCNP_RADIUS": { type: "integer", value: 0 },
  "GCNP_STATIC": { type: "integer", value: 1 },
  "GRAVITY_MULTIPLIER": { type: "integer", value: 8 },
  "HORIZONTAL": { type: "integer", value: 1 },
  "HTTP_ACCEPT": { type: "integer", value: 8 },
  "HTTP_BODY_MAXLENGTH": { type: "integer", value: 2 },
  "HTTP_BODY_TRUNCATED": { type: "integer", value: 0 },
  "HTTP_CUSTOM_HEADER": { type: "integer", value: 5 },
  "HTTP_EXTENDED_ERROR": { type: "integer", value: 9 },
  "HTTP_METHOD": { type: "integer", value: 0 },
  "HTTP_MIMETYPE": { type: "integer", value: 1 },
  "HTTP_PRAGMA_NO_CACHE": { type: "integer", value: 6 },
  "HTTP_USER_AGENT": { type: "integer", value: 7 },
  "HTTP_VERBOSE_THROTTLE": { type: "integer", value: 4 },
  "HTTP_VERIFY_CERT": { type: "integer", value: 3 },
  "IMG_USE_BAKED_AUX1": { type: "string", value: "9742065b-19b5-297c-858a-29711d539043" },
  "IMG_USE_BAKED_AUX2": { type: "string", value: "03642e83-2bd1-4eb9-34b4-4c47ed586d2d" },
  "IMG_USE_BAKED_AUX3": { type: "string", value: "edd51b77-fc10-ce7a-4b3d-011dfc349e4f" },
  "IMG_USE_BAKED_EYES": { type: "string", value: "52cc6bb6-2ee5-e632-d3ad-50197b1dcb8a" },
  "IMG_USE_BAKED_HAIR": { type: "string", value: "09aac1fb-6bce-0bee-7d44-caac6dbb6c63" },
  "IMG_USE_BAKED_HEAD": { type: "string", value: "5a9f4a74-30f2-821c-b88d-70499d3e7183" },
  "IMG_USE_BAKED_LEFTARM": { type: "string", value: "ff62763f-d60a-9855-890b-0c96f8f8cd98" },
  "IMG_USE_BAKED_LEFTLEG": { type: "string", value: "8e915e25-31d1-cc95-ae08-d58a47488251" },
  "IMG_USE_BAKED_LOWER": { type: "string", value: "24daea5f-0539-cfcf-047f-fbc40b2786ba" },
  "IMG_USE_BAKED_SKIRT": { type: "string", value: "43529ce8-7faa-ad92-165a-bc4078371687" },
  "IMG_USE_BAKED_UPPER": { type: "string", value: "ae2de45c-d252-50b8-5c6e-19f39ce79317" },
  "INVENTORY_ALL": { type: "integer", value: -1 },
  "INVENTORY_ANIMATION": { type: "integer", value: 20 },
  "INVENTORY_BODYPART": { type: "integer", value: 13 },
  "INVENTORY_CLOTHING": { type: "integer", value: 5 },
  "INVENTORY_GESTURE": { type: "integer", value: 21 },
  "INVENTORY_LANDMARK": { type: "integer", value: 3 },
  "INVENTORY_MATERIAL": { type: "integer", value: 57 },
  "INVENTORY_NONE": { type: "integer", value: -1 },
  "INVENTORY_NOTECARD": { type: "integer", value: 7 },
  "INVENTORY_OBJECT": { type: "integer", value: 6 },
  "INVENTORY_SCRIPT": { type: "integer", value: 10 },
  "INVENTORY_SETTING": { type: "integer", value: 56 },
  "INVENTORY_SOUND": { type: "integer", value: 1 },
  "INVENTORY_TEXTURE": { type: "integer", value: 0 },
  "JSON_APPEND": { type: "integer", value: -1 },
  "JSON_ARRAY": { type: "string", value: "\uFDD2" },
  "JSON_DELETE": { type: "string", value: "\uFDD8" },
  "JSON_FALSE": { type: "string", value: "\uFDD7" },
  "JSON_INVALID": { type: "string", value: "\uFDD0" },
  "JSON_NULL": { type: "string", value: "\uFDD5" },
  "JSON_NUMBER": { type: "string", value: "\uFDD3" },
  "JSON_OBJECT": { type: "string", value: "\uFDD1" },
  "JSON_STRING": { type: "string", value: "\uFDD4" },
  "JSON_TRUE": { type: "string", value: "\uFDD6" },
  "KFM_CMD_PAUSE": { type: "integer", value: 2 },
  "KFM_CMD_PLAY": { type: "integer", value: 0 },
  "KFM_CMD_STOP": { type: "integer", value: 1 },
  "KFM_COMMAND": { type: "integer", value: 0 },
  "KFM_DATA": { type: "integer", value: 2 },
  "KFM_FORWARD": { type: "integer", value: 0 },
  "KFM_LOOP": { type: "integer", value: 1 },
  "KFM_MODE": { type: "integer", value: 1 },
  "KFM_PING_PONG": { type: "integer", value: 2 },
  "KFM_REVERSE": { type: "integer", value: 3 },
  "KFM_ROTATION": { type: "integer", value: 1 },
  "KFM_TRANSLATION": { type: "integer", value: 2 },
  "LAND_LARGE_BRUSH": { type: "integer", value: 3 },
  "LAND_LEVEL": { type: "integer", value: 0 },
  "LAND_LOWER": { type: "integer", value: 2 },
  "LAND_MEDIUM_BRUSH": { type: "integer", value: 2 },
  "LAND_NOISE": { type: "integer", value: 4 },
  "LAND_RAISE": { type: "integer", value: 1 },
  "LAND_REVERT": { type: "integer", value: 5 },
  "LAND_SMALL_BRUSH": { type: "integer", value: 1 },
  "LAND_SMOOTH": { type: "integer", value: 3 },
  "LINKSETDATA_DELETE": { type: "integer", value: 2 },
  "LINKSETDATA_EMEMORY": { type: "integer", value: 1 },
  "LINKSETDATA_ENOKEY": { type: "integer", value: 2 },
  "LINKSETDATA_EPROTECTED": { type: "integer", value: 3 },
  "LINKSETDATA_MULTIDELETE": { type: "integer", value: 3 },
  "LINKSETDATA_NOTFOUND": { type: "integer", value: 4 },
  "LINKSETDATA_NOUPDATE": { type: "integer", value: 5 },
  "LINKSETDATA_OK": { type: "integer", value: 0 },
  "LINKSETDATA_RESET": { type: "integer", value: 0 },
  "LINKSETDATA_UPDATE": { type: "integer", value: 1 },
  "LINK_ALL_CHILDREN": { type: "integer", value: -3 },
  "LINK_ALL_OTHERS": { type: "integer", value: -2 },
  "LINK_ROOT": { type: "integer", value: 1 },
  "LINK_SET": { type: "integer", value: -1 },
  "LINK_THIS": { type: "integer", value: -4 },
  "LIST_STAT_GEOMETRIC_MEAN": { type: "integer", value: 9 },
  "LIST_STAT_MAX": { type: "integer", value: 2 },
  "LIST_STAT_MEAN": { type: "integer", value: 3 },
  "LIST_STAT_MEDIAN": { type: "integer", value: 4 },
  "LIST_STAT_MIN": { type: "integer", value: 1 },
  "LIST_STAT_NUM_COUNT": { type: "integer", value: 8 },
  "LIST_STAT_RANGE": { type: "integer", value: 0 },
  "LIST_STAT_STD_DEV": { type: "integer", value: 5 },
  "LIST_STAT_SUM": { type: "integer", value: 6 },
  "LIST_STAT_SUM_SQUARES": { type: "integer", value: 7 },
  "LOOP": { type: "integer", value: 2 },
  "MASK_BASE": { type: "integer", value: 0 },
  "MASK_EVERYONE": { type: "integer", value: 3 },
  "MASK_GROUP": { type: "integer", value: 2 },
  "MASK_NEXT": { type: "integer", value: 4 },
  "MASK_OWNER": { type: "integer", value: 1 },
  "NAK": { type: "string", value: "\n\n" },
  "NULL_KEY": { type: "string", value: "00000000-0000-0000-0000-000000000000" },
  "OBJECT_ACCOUNT_LEVEL": { type: "integer", value: 41 },
  "OBJECT_ANIMATED_COUNT": { type: "integer", value: 39 },
  "OBJECT_ANIMATED_SLOTS_AVAILABLE": { type: "integer", value: 40 },
  "OBJECT_ATTACHED_POINT": { type: "integer", value: 19 },
  "OBJECT_ATTACHED_SLOTS_AVAILABLE": { type: "integer", value: 35 },
  "OBJECT_BODY_SHAPE_TYPE": { type: "integer", value: 26 },
  "OBJECT_CHARACTER_TIME": { type: "integer", value: 17 },
  "OBJECT_CLICK_ACTION": { type: "integer", value: 28 },
  "OBJECT_CREATION_TIME": { type: "integer", value: 36 },
  "OBJECT_CREATOR": { type: "integer", value: 8 },
  "OBJECT_DAMAGE": { type: "integer", value: 51 },
  "OBJECT_DAMAGE_TYPE": { type: "integer", value: 52 },
  "OBJECT_DESC": { type: "integer", value: 2 },
  "OBJECT_GROUP": { type: "integer", value: 7 },
  "OBJECT_GROUP_TAG": { type: "integer", value: 33 },
  "OBJECT_HEALTH": { type: "integer", value: 50 },
  "OBJECT_HOVER_HEIGHT": { type: "integer", value: 25 },
  "OBJECT_LAST_OWNER_ID": { type: "integer", value: 27 },
  "OBJECT_LINK_NUMBER": { type: "integer", value: 46 },
  "OBJECT_MASS": { type: "integer", value: 43 },
  "OBJECT_MATERIAL": { type: "integer", value: 42 },
  "OBJECT_NAME": { type: "integer", value: 1 },
  "OBJECT_OMEGA": { type: "integer", value: 29 },
  "OBJECT_OWNER": { type: "integer", value: 6 },
  "OBJECT_PATHFINDING_TYPE": { type: "integer", value: 20 },
  "OBJECT_PHANTOM": { type: "integer", value: 22 },
  "OBJECT_PHYSICS": { type: "integer", value: 21 },
  "OBJECT_PHYSICS_COST": { type: "integer", value: 16 },
  "OBJECT_POS": { type: "integer", value: 3 },
  "OBJECT_PRIM_COUNT": { type: "integer", value: 30 },
  "OBJECT_PRIM_EQUIVALENCE": { type: "integer", value: 13 },
  "OBJECT_RENDER_WEIGHT": { type: "integer", value: 24 },
  "OBJECT_RETURN_PARCEL": { type: "integer", value: 1 },
  "OBJECT_RETURN_PARCEL_OWNER": { type: "integer", value: 2 },
  "OBJECT_RETURN_REGION": { type: "integer", value: 4 },
  "OBJECT_REZZER_KEY": { type: "integer", value: 32 },
  "OBJECT_REZ_TIME": { type: "integer", value: 45 },
  "OBJECT_ROOT": { type: "integer", value: 18 },
  "OBJECT_ROT": { type: "integer", value: 4 },
  "OBJECT_RUNNING_SCRIPT_COUNT": { type: "integer", value: 9 },
  "OBJECT_SCALE": { type: "integer", value: 47 },
  "OBJECT_SCRIPT_MEMORY": { type: "integer", value: 11 },
  "OBJECT_SCRIPT_TIME": { type: "integer", value: 12 },
  "OBJECT_SELECT_COUNT": { type: "integer", value: 37 },
  "OBJECT_SERVER_COST": { type: "integer", value: 14 },
  "OBJECT_SIT_COUNT": { type: "integer", value: 38 },
  "OBJECT_STREAMING_COST": { type: "integer", value: 15 },
  "OBJECT_TEMP_ATTACHED": { type: "integer", value: 34 },
  "OBJECT_TEMP_ON_REZ": { type: "integer", value: 23 },
  "OBJECT_TEXT": { type: "integer", value: 44 },
  "OBJECT_TEXT_ALPHA": { type: "integer", value: 49 },
  "OBJECT_TEXT_COLOR": { type: "integer", value: 48 },
  "OBJECT_TOTAL_INVENTORY_COUNT": { type: "integer", value: 31 },
  "OBJECT_TOTAL_SCRIPT_COUNT": { type: "integer", value: 10 },
  "OBJECT_UNKNOWN_DETAIL": { type: "integer", value: -1 },
  "OBJECT_VELOCITY": { type: "integer", value: 5 },
  "OPT_AVATAR": { type: "integer", value: 1 },
  "OPT_CHARACTER": { type: "integer", value: 2 },
  "OPT_EXCLUSION_VOLUME": { type: "integer", value: 6 },
  "OPT_LEGACY_LINKSET": { type: "integer", value: 0 },
  "OPT_MATERIAL_VOLUME": { type: "integer", value: 5 },
  "OPT_OTHER": { type: "integer", value: -1 },
  "OPT_STATIC_OBSTACLE": { type: "integer", value: 4 },
  "OPT_WALKABLE": { type: "integer", value: 3 },
  "PARCEL_COUNT_GROUP": { type: "integer", value: 2 },
  "PARCEL_COUNT_OTHER": { type: "integer", value: 3 },
  "PARCEL_COUNT_OWNER": { type: "integer", value: 1 },
  "PARCEL_COUNT_SELECTED": { type: "integer", value: 4 },
  "PARCEL_COUNT_TEMP": { type: "integer", value: 5 },
  "PARCEL_COUNT_TOTAL": { type: "integer", value: 0 },
  "PARCEL_DETAILS_AREA": { type: "integer", value: 4 },
  "PARCEL_DETAILS_DESC": { type: "integer", value: 1 },
  "PARCEL_DETAILS_FLAGS": { type: "integer", value: 12 },
  "PARCEL_DETAILS_GROUP": { type: "integer", value: 3 },
  "PARCEL_DETAILS_ID": { type: "integer", value: 5 },
  "PARCEL_DETAILS_LANDING_LOOKAT": { type: "integer", value: 10 },
  "PARCEL_DETAILS_LANDING_POINT": { type: "integer", value: 9 },
  "PARCEL_DETAILS_NAME": { type: "integer", value: 0 },
  "PARCEL_DETAILS_OWNER": { type: "integer", value: 2 },
  "PARCEL_DETAILS_PRIM_CAPACITY": { type: "integer", value: 7 },
  "PARCEL_DETAILS_PRIM_USED": { type: "integer", value: 8 },
  "PARCEL_DETAILS_SCRIPT_DANGER": { type: "integer", value: 13 },
  "PARCEL_DETAILS_SEE_AVATARS": { type: "integer", value: 6 },
  "PARCEL_DETAILS_TP_ROUTING": { type: "integer", value: 11 },
  "PARCEL_FLAG_ALLOW_ALL_OBJECT_ENTRY": { type: "integer", value: 134217728 },
  "PARCEL_FLAG_ALLOW_CREATE_GROUP_OBJECTS": { type: "integer", value: 67108864 },
  "PARCEL_FLAG_ALLOW_CREATE_OBJECTS": { type: "integer", value: 64 },
  "PARCEL_FLAG_ALLOW_DAMAGE": { type: "integer", value: 32 },
  "PARCEL_FLAG_ALLOW_FLY": { type: "integer", value: 1 },
  "PARCEL_FLAG_ALLOW_GROUP_OBJECT_ENTRY": { type: "integer", value: 268435456 },
  "PARCEL_FLAG_ALLOW_GROUP_SCRIPTS": { type: "integer", value: 33554432 },
  "PARCEL_FLAG_ALLOW_LANDMARK": { type: "integer", value: 8 },
  "PARCEL_FLAG_ALLOW_SCRIPTS": { type: "integer", value: 2 },
  "PARCEL_FLAG_ALLOW_TERRAFORM": { type: "integer", value: 16 },
  "PARCEL_FLAG_LOCAL_SOUND_ONLY": { type: "integer", value: 32768 },
  "PARCEL_FLAG_RESTRICT_PUSHOBJECT": { type: "integer", value: 2097152 },
  "PARCEL_FLAG_USE_ACCESS_GROUP": { type: "integer", value: 256 },
  "PARCEL_FLAG_USE_ACCESS_LIST": { type: "integer", value: 512 },
  "PARCEL_FLAG_USE_BAN_LIST": { type: "integer", value: 1024 },
  "PARCEL_FLAG_USE_LAND_PASS_LIST": { type: "integer", value: 2048 },
  "PARCEL_MEDIA_COMMAND_AGENT": { type: "integer", value: 7 },
  "PARCEL_MEDIA_COMMAND_AUTO_ALIGN": { type: "integer", value: 9 },
  "PARCEL_MEDIA_COMMAND_DESC": { type: "integer", value: 12 },
  "PARCEL_MEDIA_COMMAND_LOOP": { type: "integer", value: 3 },
  "PARCEL_MEDIA_COMMAND_LOOP_SET": { type: "integer", value: 13 },
  "PARCEL_MEDIA_COMMAND_PAUSE": { type: "integer", value: 1 },
  "PARCEL_MEDIA_COMMAND_PLAY": { type: "integer", value: 2 },
  "PARCEL_MEDIA_COMMAND_SIZE": { type: "integer", value: 11 },
  "PARCEL_MEDIA_COMMAND_STOP": { type: "integer", value: 0 },
  "PARCEL_MEDIA_COMMAND_TEXTURE": { type: "integer", value: 4 },
  "PARCEL_MEDIA_COMMAND_TIME": { type: "integer", value: 6 },
  "PARCEL_MEDIA_COMMAND_TYPE": { type: "integer", value: 10 },
  "PARCEL_MEDIA_COMMAND_UNLOAD": { type: "integer", value: 8 },
  "PARCEL_MEDIA_COMMAND_URL": { type: "integer", value: 5 },
  "PASSIVE": { type: "integer", value: 4 },
  "PASS_ALWAYS": { type: "integer", value: 1 },
  "PASS_IF_NOT_HANDLED": { type: "integer", value: 0 },
  "PASS_NEVER": { type: "integer", value: 2 },
  "PATROL_PAUSE_AT_WAYPOINTS": { type: "integer", value: 0 },
  "PAYMENT_INFO_ON_FILE": { type: "integer", value: 1 },
  "PAYMENT_INFO_USED": { type: "integer", value: 2 },
  "PAY_DEFAULT": { type: "integer", value: -2 },
  "PAY_HIDE": { type: "integer", value: -1 },
  "PERMISSION_ATTACH": { type: "integer", value: 32 },
  "PERMISSION_CHANGE_JOINTS": { type: "integer", value: 256 },
  "PERMISSION_CHANGE_LINKS": { type: "integer", value: 128 },
  "PERMISSION_CHANGE_PERMISSIONS": { type: "integer", value: 512 },
  "PERMISSION_CONTROL_CAMERA": { type: "integer", value: 2048 },
  "PERMISSION_DEBIT": { type: "integer", value: 2 },
  "PERMISSION_OVERRIDE_ANIMATIONS": { type: "integer", value: 32768 },
  "PERMISSION_RELEASE_OWNERSHIP": { type: "integer", value: 64 },
  "PERMISSION_REMAP_CONTROLS": { type: "integer", value: 8 },
  "PERMISSION_RETURN_OBJECTS": { type: "integer", value: 65536 },
  "PERMISSION_SILENT_ESTATE_MANAGEMENT": { type: "integer", value: 16384 },
  "PERMISSION_TAKE_CONTROLS": { type: "integer", value: 4 },
  "PERMISSION_TELEPORT": { type: "integer", value: 4096 },
  "PERMISSION_TRACK_CAMERA": { type: "integer", value: 1024 },
  "PERMISSION_TRIGGER_ANIMATION": { type: "integer", value: 16 },
  "PERM_ALL": { type: "integer", value: 2147483647 },
  "PERM_COPY": { type: "integer", value: 32768 },
  "PERM_MODIFY": { type: "integer", value: 16384 },
  "PERM_MOVE": { type: "integer", value: 524288 },
  "PERM_TRANSFER": { type: "integer", value: 8192 },
  "PI": { type: "float", value: 3.14159265 },
  "PING_PONG": { type: "integer", value: 8 },
  "PI_BY_TWO": { type: "float", value: 1.57079633 },
  "PRIM_ALLOW_UNSIT": { type: "integer", value: 39 },
  "PRIM_ALPHA_MODE": { type: "integer", value: 38 },
  "PRIM_ALPHA_MODE_BLEND": { type: "integer", value: 1 },
  "PRIM_ALPHA_MODE_EMISSIVE": { type: "integer", value: 3 },
  "PRIM_ALPHA_MODE_MASK": { type: "integer", value: 2 },
  "PRIM_ALPHA_MODE_NONE": { type: "integer", value: 0 },
  "PRIM_BUMP_BARK": { type: "integer", value: 4 },
  "PRIM_BUMP_BLOBS": { type: "integer", value: 12 },
  "PRIM_BUMP_BRICKS": { type: "integer", value: 5 },
  "PRIM_BUMP_BRIGHT": { type: "integer", value: 1 },
  "PRIM_BUMP_CHECKER": { type: "integer", value: 6 },
  "PRIM_BUMP_CONCRETE": { type: "integer", value: 7 },
  "PRIM_BUMP_DARK": { type: "integer", value: 2 },
  "PRIM_BUMP_DISKS": { type: "integer", value: 10 },
  "PRIM_BUMP_GRAVEL": { type: "integer", value: 11 },
  "PRIM_BUMP_LARGETILE": { type: "integer", value: 14 },
  "PRIM_BUMP_NONE": { type: "integer", value: 0 },
  "PRIM_BUMP_SHINY": { type: "integer", value: 19 },
  "PRIM_BUMP_SIDING": { type: "integer", value: 13 },
  "PRIM_BUMP_STONE": { type: "integer", value: 9 },
  "PRIM_BUMP_STUCCO": { type: "integer", value: 15 },
  "PRIM_BUMP_SUCTION": { type: "integer", value: 16 },
  "PRIM_BUMP_TILE": { type: "integer", value: 8 },
  "PRIM_BUMP_WEAVE": { type: "integer", value: 17 },
  "PRIM_BUMP_WOOD": { type: "integer", value: 3 },
  "PRIM_CAST_SHADOWS": { type: "integer", value: 24 },
  "PRIM_CLICK_ACTION": { type: "integer", value: 43 },
  "PRIM_COLOR": { type: "integer", value: 18 },
  "PRIM_DAMAGE": { type: "integer", value: 51 },
  "PRIM_DESC": { type: "integer", value: 28 },
  "PRIM_FLEXIBLE": { type: "integer", value: 21 },
  "PRIM_FULLBRIGHT": { type: "integer", value: 20 },
  "PRIM_GLOW": { type: "integer", value: 25 },
  "PRIM_GLTF_ALPHA_MODE_BLEND": { type: "integer", value: 1 },
  "PRIM_GLTF_ALPHA_MODE_MASK": { type: "integer", value: 2 },
  "PRIM_GLTF_ALPHA_MODE_OPAQUE": { type: "integer", value: 0 },
  "PRIM_GLTF_BASE_COLOR": { type: "integer", value: 48 },
  "PRIM_GLTF_EMISSIVE": { type: "integer", value: 46 },
  "PRIM_GLTF_METALLIC_ROUGHNESS": { type: "integer", value: 47 },
  "PRIM_GLTF_NORMAL": { type: "integer", value: 45 },
  "PRIM_HEALTH": { type: "integer", value: 52 },
  "PRIM_HOLE_CIRCLE": { type: "integer", value: 16 },
  "PRIM_HOLE_DEFAULT": { type: "integer", value: 0 },
  "PRIM_HOLE_SQUARE": { type: "integer", value: 32 },
  "PRIM_HOLE_TRIANGLE": { type: "integer", value: 48 },
  "PRIM_LINK_TARGET": { type: "integer", value: 34 },
  "PRIM_MATERIAL": { type: "integer", value: 2 },
  "PRIM_MATERIAL_FLESH": { type: "integer", value: 4 },
  "PRIM_MATERIAL_GLASS": { type: "integer", value: 2 },
  "PRIM_MATERIAL_LIGHT": { type: "integer", value: 7 },
  "PRIM_MATERIAL_METAL": { type: "integer", value: 1 },
  "PRIM_MATERIAL_PLASTIC": { type: "integer", value: 5 },
  "PRIM_MATERIAL_RUBBER": { type: "integer", value: 6 },
  "PRIM_MATERIAL_STONE": { type: "integer", value: 0 },
  "PRIM_MATERIAL_WOOD": { type: "integer", value: 3 },
  "PRIM_MEDIA_ALT_IMAGE_ENABLE": { type: "integer", value: 0 },
  "PRIM_MEDIA_AUTO_LOOP": { type: "integer", value: 4 },
  "PRIM_MEDIA_AUTO_PLAY": { type: "integer", value: 5 },
  "PRIM_MEDIA_AUTO_SCALE": { type: "integer", value: 6 },
  "PRIM_MEDIA_AUTO_ZOOM": { type: "integer", value: 7 },
  "PRIM_MEDIA_CONTROLS": { type: "integer", value: 1 },
  "PRIM_MEDIA_CONTROLS_MINI": { type: "integer", value: 1 },
  "PRIM_MEDIA_CONTROLS_STANDARD": { type: "integer", value: 0 },
  "PRIM_MEDIA_CURRENT_URL": { type: "integer", value: 2 },
  "PRIM_MEDIA_FIRST_CLICK_INTERACT": { type: "integer", value: 8 },
  "PRIM_MEDIA_HEIGHT_PIXELS": { type: "integer", value: 10 },
  "PRIM_MEDIA_HOME_URL": { type: "integer", value: 3 },
  "PRIM_MEDIA_MAX_HEIGHT_PIXELS": { type: "integer", value: 2048 },
  "PRIM_MEDIA_MAX_URL_LENGTH": { type: "integer", value: 1024 },
  "PRIM_MEDIA_MAX_WHITELIST_COUNT": { type: "integer", value: 64 },
  "PRIM_MEDIA_MAX_WHITELIST_SIZE": { type: "integer", value: 1024 },
  "PRIM_MEDIA_MAX_WIDTH_PIXELS": { type: "integer", value: 2048 },
  "PRIM_MEDIA_PARAM_MAX": { type: "integer", value: 14 },
  "PRIM_MEDIA_PERMS_CONTROL": { type: "integer", value: 14 },
  "PRIM_MEDIA_PERMS_INTERACT": { type: "integer", value: 13 },
  "PRIM_MEDIA_PERM_ANYONE": { type: "integer", value: 4 },
  "PRIM_MEDIA_PERM_GROUP": { type: "integer", value: 2 },
  "PRIM_MEDIA_PERM_NONE": { type: "integer", value: 0 },
  "PRIM_MEDIA_PERM_OWNER": { type: "integer", value: 1 },
  "PRIM_MEDIA_WHITELIST": { type: "integer", value: 12 },
  "PRIM_MEDIA_WHITELIST_ENABLE": { type: "integer", value: 11 },
  "PRIM_MEDIA_WIDTH_PIXELS": { type: "integer", value: 9 },
  "PRIM_NAME": { type: "integer", value: 27 },
  "PRIM_NORMAL": { type: "integer", value: 37 },
  "PRIM_OMEGA": { type: "integer", value: 32 },
  "PRIM_PHANTOM": { type: "integer", value: 5 },
  "PRIM_PHYSICS": { type: "integer", value: 3 },
  "PRIM_PHYSICS_SHAPE_CONVEX": { type: "integer", value: 2 },
  "PRIM_PHYSICS_SHAPE_NONE": { type: "integer", value: 1 },
  "PRIM_PHYSICS_SHAPE_PRIM": { type: "integer", value: 0 },
  "PRIM_PHYSICS_SHAPE_TYPE": { type: "integer", value: 30 },
  "PRIM_POINT_LIGHT": { type: "integer", value: 23 },
  "PRIM_POSITION": { type: "integer", value: 6 },
  "PRIM_POS_LOCAL": { type: "integer", value: 33 },
  "PRIM_PROJECTOR": { type: "integer", value: 42 },
  "PRIM_REFLECTION_PROBE": { type: "integer", value: 44 },
  "PRIM_REFLECTION_PROBE_BOX": { type: "integer", value: 1 },
  "PRIM_REFLECTION_PROBE_DYNAMIC": { type: "integer", value: 2 },
  "PRIM_REFLECTION_PROBE_MIRROR": { type: "integer", value: 4 },
  "PRIM_RENDER_MATERIAL": { type: "integer", value: 49 },
  "PRIM_ROTATION": { type: "integer", value: 8 },
  "PRIM_ROT_LOCAL": { type: "integer", value: 29 },
  "PRIM_SCRIPTED_SIT_ONLY": { type: "integer", value: 40 },
  "PRIM_SCULPT_FLAG_ANIMESH": { type: "integer", value: 32 },
  "PRIM_SCULPT_FLAG_INVERT": { type: "integer", value: 64 },
  "PRIM_SCULPT_FLAG_MIRROR": { type: "integer", value: 128 },
  "PRIM_SCULPT_TYPE_CYLINDER": { type: "integer", value: 4 },
  "PRIM_SCULPT_TYPE_MASK": { type: "integer", value: 7 },
  "PRIM_SCULPT_TYPE_MESH": { type: "integer", value: 5 },
  "PRIM_SCULPT_TYPE_PLANE": { type: "integer", value: 3 },
  "PRIM_SCULPT_TYPE_SPHERE": { type: "integer", value: 1 },
  "PRIM_SCULPT_TYPE_TORUS": { type: "integer", value: 2 },
  "PRIM_SHINY_HIGH": { type: "integer", value: 3 },
  "PRIM_SHINY_LOW": { type: "integer", value: 1 },
  "PRIM_SHINY_MEDIUM": { type: "integer", value: 2 },
  "PRIM_SHINY_NONE": { type: "integer", value: 0 },
  "PRIM_SIT_FLAGS": { type: "integer", value: 50 },
  "PRIM_SIT_TARGET": { type: "integer", value: 41 },
  "PRIM_SIZE": { type: "integer", value: 7 },
  "PRIM_SLICE": { type: "integer", value: 35 },
  "PRIM_SPECULAR": { type: "integer", value: 36 },
  "PRIM_TEMP_ON_REZ": { type: "integer", value: 4 },
  "PRIM_TEXGEN": { type: "integer", value: 22 },
  "PRIM_TEXGEN_DEFAULT": { type: "integer", value: 0 },
  "PRIM_TEXGEN_PLANAR": { type: "integer", value: 1 },
  "PRIM_TEXT": { type: "integer", value: 26 },
  "PRIM_TEXTURE": { type: "integer", value: 17 },
  "PRIM_TYPE": { type: "integer", value: 9 },
  "PRIM_TYPE_BOX": { type: "integer", value: 0 },
  "PRIM_TYPE_CYLINDER": { type: "integer", value: 1 },
  "PRIM_TYPE_PRISM": { type: "integer", value: 2 },
  "PRIM_TYPE_RING": { type: "integer", value: 6 },
  "PRIM_TYPE_SCULPT": { type: "integer", value: 7 },
  "PRIM_TYPE_SPHERE": { type: "integer", value: 3 },
  "PRIM_TYPE_TORUS": { type: "integer", value: 4 },
  "PRIM_TYPE_TUBE": { type: "integer", value: 5 },
  "PROFILE_NONE": { type: "integer", value: 0 },
  "PROFILE_SCRIPT_MEMORY": { type: "integer", value: 1 },
  "PSYS_PART_BF_DEST_COLOR": { type: "integer", value: 2 },
  "PSYS_PART_BF_ONE": { type: "integer", value: 0 },
  "PSYS_PART_BF_ONE_MINUS_DEST_COLOR": { type: "integer", value: 4 },
  "PSYS_PART_BF_ONE_MINUS_SOURCE_ALPHA": { type: "integer", value: 9 },
  "PSYS_PART_BF_ONE_MINUS_SOURCE_COLOR": { type: "integer", value: 5 },
  "PSYS_PART_BF_SOURCE_ALPHA": { type: "integer", value: 7 },
  "PSYS_PART_BF_SOURCE_COLOR": { type: "integer", value: 3 },
  "PSYS_PART_BF_ZERO": { type: "integer", value: 1 },
  "PSYS_PART_BLEND_FUNC_DEST": { type: "integer", value: 25 },
  "PSYS_PART_BLEND_FUNC_SOURCE": { type: "integer", value: 24 },
  "PSYS_PART_BOUNCE_MASK": { type: "integer", value: 4 },
  "PSYS_PART_EMISSIVE_MASK": { type: "integer", value: 256 },
  "PSYS_PART_END_ALPHA": { type: "integer", value: 4 },
  "PSYS_PART_END_COLOR": { type: "integer", value: 3 },
  "PSYS_PART_END_GLOW": { type: "integer", value: 27 },
  "PSYS_PART_END_SCALE": { type: "integer", value: 6 },
  "PSYS_PART_FLAGS": { type: "integer", value: 0 },
  "PSYS_PART_FOLLOW_SRC_MASK": { type: "integer", value: 16 },
  "PSYS_PART_FOLLOW_VELOCITY_MASK": { type: "integer", value: 32 },
  "PSYS_PART_INTERP_COLOR_MASK": { type: "integer", value: 1 },
  "PSYS_PART_INTERP_SCALE_MASK": { type: "integer", value: 2 },
  "PSYS_PART_MAX_AGE": { type: "integer", value: 7 },
  "PSYS_PART_RIBBON_MASK": { type: "integer", value: 1024 },
  "PSYS_PART_START_ALPHA": { type: "integer", value: 2 },
  "PSYS_PART_START_COLOR": { type: "integer", value: 1 },
  "PSYS_PART_START_GLOW": { type: "integer", value: 26 },
  "PSYS_PART_START_SCALE": { type: "integer", value: 5 },
  "PSYS_PART_TARGET_LINEAR_MASK": { type: "integer", value: 128 },
  "PSYS_PART_TARGET_POS_MASK": { type: "integer", value: 64 },
  "PSYS_PART_WIND_MASK": { type: "integer", value: 8 },
  "PSYS_SRC_ACCEL": { type: "integer", value: 8 },
  "PSYS_SRC_ANGLE_BEGIN": { type: "integer", value: 22 },
  "PSYS_SRC_ANGLE_END": { type: "integer", value: 23 },
  "PSYS_SRC_BURST_PART_COUNT": { type: "integer", value: 15 },
  "PSYS_SRC_BURST_RADIUS": { type: "integer", value: 16 },
  "PSYS_SRC_BURST_RATE": { type: "integer", value: 13 },
  "PSYS_SRC_BURST_SPEED_MAX": { type: "integer", value: 18 },
  "PSYS_SRC_BURST_SPEED_MIN": { type: "integer", value: 17 },
  "PSYS_SRC_INNERANGLE": { type: "integer", value: 10 },
  "PSYS_SRC_MAX_AGE": { type: "integer", value: 19 },
  "PSYS_SRC_OBJ_REL_MASK": { type: "integer", value: 1 },
  "PSYS_SRC_OMEGA": { type: "integer", value: 21 },
  "PSYS_SRC_OUTERANGLE": { type: "integer", value: 11 },
  "PSYS_SRC_PATTERN": { type: "integer", value: 9 },
  "PSYS_SRC_PATTERN_ANGLE": { type: "integer", value: 4 },
  "PSYS_SRC_PATTERN_ANGLE_CONE": { type: "integer", value: 8 },
  "PSYS_SRC_PATTERN_ANGLE_CONE_EMPTY": { type: "integer", value: 16 },
  "PSYS_SRC_PATTERN_DROP": { type: "integer", value: 1 },
  "PSYS_SRC_PATTERN_EXPLODE": { type: "integer", value: 2 },
  "PSYS_SRC_TARGET_KEY": { type: "integer", value: 20 },
  "PSYS_SRC_TEXTURE": { type: "integer", value: 12 },
  "PUBLIC_CHANNEL": { type: "integer", value: 0 },
  "PURSUIT_FUZZ_FACTOR": { type: "integer", value: 3 },
  "PURSUIT_GOAL_TOLERANCE": { type: "integer", value: 5 },
  "PURSUIT_INTERCEPT": { type: "integer", value: 4 },
  "PURSUIT_OFFSET": { type: "integer", value: 1 },
  "PU_EVADE_HIDDEN": { type: "integer", value: 7 },
  "PU_EVADE_SPOTTED": { type: "integer", value: 8 },
  "PU_FAILURE_DYNAMIC_PATHFINDING_DISABLED": { type: "integer", value: 10 },
  "PU_FAILURE_INVALID_GOAL": { type: "integer", value: 3 },
  "PU_FAILURE_INVALID_START": { type: "integer", value: 2 },
  "PU_FAILURE_NO_NAVMESH": { type: "integer", value: 9 },
  "PU_FAILURE_NO_VALID_DESTINATION": { type: "integer", value: 6 },
  "PU_FAILURE_OTHER": { type: "integer", value: 1e6 },
  "PU_FAILURE_PARCEL_UNREACHABLE": { type: "integer", value: 11 },
  "PU_FAILURE_TARGET_GONE": { type: "integer", value: 5 },
  "PU_FAILURE_UNREACHABLE": { type: "integer", value: 4 },
  "PU_GOAL_REACHED": { type: "integer", value: 1 },
  "PU_SLOWDOWN_DISTANCE_REACHED": { type: "integer", value: 0 },
  "RAD_TO_DEG": { type: "float", value: 57.2957795 },
  "RCERR_CAST_TIME_EXCEEDED": { type: "integer", value: -3 },
  "RCERR_SIM_PERF_LOW": { type: "integer", value: -2 },
  "RCERR_UNKNOWN": { type: "integer", value: -1 },
  "RC_DATA_FLAGS": { type: "integer", value: 2 },
  "RC_DETECT_PHANTOM": { type: "integer", value: 1 },
  "RC_GET_LINK_NUM": { type: "integer", value: 4 },
  "RC_GET_NORMAL": { type: "integer", value: 1 },
  "RC_GET_ROOT_KEY": { type: "integer", value: 2 },
  "RC_MAX_HITS": { type: "integer", value: 3 },
  "RC_REJECT_AGENTS": { type: "integer", value: 1 },
  "RC_REJECT_LAND": { type: "integer", value: 8 },
  "RC_REJECT_NONPHYSICAL": { type: "integer", value: 4 },
  "RC_REJECT_PHYSICAL": { type: "integer", value: 2 },
  "RC_REJECT_TYPES": { type: "integer", value: 0 },
  "REGION_FLAG_ALLOW_DAMAGE": { type: "integer", value: 1 },
  "REGION_FLAG_ALLOW_DIRECT_TELEPORT": { type: "integer", value: 1048576 },
  "REGION_FLAG_BLOCK_FLY": { type: "integer", value: 524288 },
  "REGION_FLAG_BLOCK_FLYOVER": { type: "integer", value: 134217728 },
  "REGION_FLAG_BLOCK_TERRAFORM": { type: "integer", value: 64 },
  "REGION_FLAG_DISABLE_COLLISIONS": { type: "integer", value: 4096 },
  "REGION_FLAG_DISABLE_PHYSICS": { type: "integer", value: 16384 },
  "REGION_FLAG_FIXED_SUN": { type: "integer", value: 16 },
  "REGION_FLAG_RESTRICT_PUSHOBJECT": { type: "integer", value: 4194304 },
  "REGION_FLAG_SANDBOX": { type: "integer", value: 256 },
  "REMOTE_DATA_CHANNEL": { type: "integer", value: 1 },
  "REMOTE_DATA_REPLY": { type: "integer", value: 3 },
  "REMOTE_DATA_REQUEST": { type: "integer", value: 2 },
  "REQUIRE_LINE_OF_SIGHT": { type: "integer", value: 2 },
  "RESTITUTION": { type: "integer", value: 4 },
  "REVERSE": { type: "integer", value: 4 },
  "REZ_ACCEL": { type: "integer", value: 5 },
  "REZ_DAMAGE": { type: "integer", value: 8 },
  "REZ_DAMAGE_TYPE": { type: "integer", value: 12 },
  "REZ_FLAGS": { type: "integer", value: 1 },
  "REZ_FLAG_BLOCK_GRAB_OBJECT": { type: "integer", value: 128 },
  "REZ_FLAG_DIE_ON_COLLIDE": { type: "integer", value: 8 },
  "REZ_FLAG_DIE_ON_NOENTRY": { type: "integer", value: 16 },
  "REZ_FLAG_NO_COLLIDE_FAMILY": { type: "integer", value: 64 },
  "REZ_FLAG_NO_COLLIDE_OWNER": { type: "integer", value: 32 },
  "REZ_FLAG_PHANTOM": { type: "integer", value: 4 },
  "REZ_FLAG_PHYSICAL": { type: "integer", value: 2 },
  "REZ_FLAG_TEMP": { type: "integer", value: 1 },
  "REZ_LOCK_AXES": { type: "integer", value: 11 },
  "REZ_OMEGA": { type: "integer", value: 7 },
  "REZ_PARAM": { type: "integer", value: 0 },
  "REZ_PARAM_STRING": { type: "integer", value: 13 },
  "REZ_POS": { type: "integer", value: 2 },
  "REZ_ROT": { type: "integer", value: 3 },
  "REZ_SOUND": { type: "integer", value: 9 },
  "REZ_SOUND_COLLIDE": { type: "integer", value: 10 },
  "REZ_VEL": { type: "integer", value: 4 },
  "ROTATE": { type: "integer", value: 32 },
  "SCALE": { type: "integer", value: 64 },
  "SCRIPTED": { type: "integer", value: 8 },
  "SIM_STAT_ACTIVE_SCRIPT_COUNT": { type: "integer", value: 12 },
  "SIM_STAT_AGENT_COUNT": { type: "integer", value: 10 },
  "SIM_STAT_AGENT_MS": { type: "integer", value: 7 },
  "SIM_STAT_AGENT_UPDATES": { type: "integer", value: 2 },
  "SIM_STAT_AI_MS": { type: "integer", value: 26 },
  "SIM_STAT_ASSET_DOWNLOADS": { type: "integer", value: 15 },
  "SIM_STAT_ASSET_UPLOADS": { type: "integer", value: 16 },
  "SIM_STAT_CHILD_AGENT_COUNT": { type: "integer", value: 11 },
  "SIM_STAT_FRAME_MS": { type: "integer", value: 3 },
  "SIM_STAT_IMAGE_MS": { type: "integer", value: 8 },
  "SIM_STAT_IO_PUMP_MS": { type: "integer", value: 24 },
  "SIM_STAT_NET_MS": { type: "integer", value: 4 },
  "SIM_STAT_OTHER_MS": { type: "integer", value: 5 },
  "SIM_STAT_PACKETS_IN": { type: "integer", value: 13 },
  "SIM_STAT_PACKETS_OUT": { type: "integer", value: 14 },
  "SIM_STAT_PCT_CHARS_STEPPED": { type: "integer", value: 0 },
  "SIM_STAT_PHYSICS_FPS": { type: "integer", value: 1 },
  "SIM_STAT_PHYSICS_MS": { type: "integer", value: 6 },
  "SIM_STAT_PHYSICS_OTHER_MS": { type: "integer", value: 20 },
  "SIM_STAT_PHYSICS_SHAPE_MS": { type: "integer", value: 19 },
  "SIM_STAT_PHYSICS_STEP_MS": { type: "integer", value: 18 },
  "SIM_STAT_SCRIPT_EPS": { type: "integer", value: 21 },
  "SIM_STAT_SCRIPT_MS": { type: "integer", value: 9 },
  "SIM_STAT_SCRIPT_RUN_PCT": { type: "integer", value: 25 },
  "SIM_STAT_SLEEP_MS": { type: "integer", value: 23 },
  "SIM_STAT_SPARE_MS": { type: "integer", value: 22 },
  "SIM_STAT_UNACKED_BYTES": { type: "integer", value: 17 },
  "SIT_FLAG_ALLOW_UNSIT": { type: "integer", value: 2 },
  "SIT_FLAG_NO_COLLIDE": { type: "integer", value: 16 },
  "SIT_FLAG_NO_DAMAGE": { type: "integer", value: 32 },
  "SIT_FLAG_SCRIPTED_ONLY": { type: "integer", value: 4 },
  "SIT_FLAG_SIT_TARGET": { type: "integer", value: 1 },
  "SIT_INVALID_AGENT": { type: "integer", value: -4 },
  "SIT_INVALID_LINK": { type: "integer", value: -5 },
  "SIT_INVALID_OBJECT": { type: "integer", value: -7 },
  "SIT_NOT_EXPERIENCE": { type: "integer", value: -1 },
  "SIT_NO_ACCESS": { type: "integer", value: -6 },
  "SIT_NO_EXPERIENCE_PERMISSION": { type: "integer", value: -2 },
  "SIT_NO_SIT_TARGET": { type: "integer", value: -3 },
  "SKY_ABSORPTION_CONFIG": { type: "integer", value: 16 },
  "SKY_AMBIENT": { type: "integer", value: 0 },
  "SKY_BLUE": { type: "integer", value: 22 },
  "SKY_CLOUDS": { type: "integer", value: 2 },
  "SKY_CLOUD_TEXTURE": { type: "integer", value: 19 },
  "SKY_DENSITY_PROFILE_COUNTS": { type: "integer", value: 3 },
  "SKY_DOME": { type: "integer", value: 4 },
  "SKY_GAMMA": { type: "integer", value: 5 },
  "SKY_GLOW": { type: "integer", value: 6 },
  "SKY_HAZE": { type: "integer", value: 23 },
  "SKY_LIGHT": { type: "integer", value: 8 },
  "SKY_MIE_CONFIG": { type: "integer", value: 17 },
  "SKY_MOON": { type: "integer", value: 9 },
  "SKY_MOON_TEXTURE": { type: "integer", value: 20 },
  "SKY_PLANET": { type: "integer", value: 10 },
  "SKY_RAYLEIGH_CONFIG": { type: "integer", value: 18 },
  "SKY_REFLECTION_PROBE_AMBIANCE": { type: "integer", value: 24 },
  "SKY_REFRACTION": { type: "integer", value: 11 },
  "SKY_STAR_BRIGHTNESS": { type: "integer", value: 13 },
  "SKY_SUN": { type: "integer", value: 14 },
  "SKY_SUN_TEXTURE": { type: "integer", value: 21 },
  "SKY_TEXTURE_DEFAULTS": { type: "integer", value: 1 },
  "SKY_TRACKS": { type: "integer", value: 15 },
  "SMOOTH": { type: "integer", value: 16 },
  "SOUND_LOOP": { type: "integer", value: 1 },
  "SOUND_PLAY": { type: "integer", value: 0 },
  "SOUND_SYNC": { type: "integer", value: 4 },
  "SOUND_TRIGGER": { type: "integer", value: 2 },
  "SQRT2": { type: "float", value: 1.41421356 },
  "STATUS_BLOCK_GRAB": { type: "integer", value: 64 },
  "STATUS_BLOCK_GRAB_OBJECT": { type: "integer", value: 1024 },
  "STATUS_BOUNDS_ERROR": { type: "integer", value: 1002 },
  "STATUS_CAST_SHADOWS": { type: "integer", value: 512 },
  "STATUS_DIE_AT_EDGE": { type: "integer", value: 128 },
  "STATUS_DIE_AT_NO_ENTRY": { type: "integer", value: 2048 },
  "STATUS_INTERNAL_ERROR": { type: "integer", value: 1999 },
  "STATUS_MALFORMED_PARAMS": { type: "integer", value: 1e3 },
  "STATUS_NOT_FOUND": { type: "integer", value: 1003 },
  "STATUS_NOT_SUPPORTED": { type: "integer", value: 1004 },
  "STATUS_OK": { type: "integer", value: 0 },
  "STATUS_PHANTOM": { type: "integer", value: 16 },
  "STATUS_PHYSICS": { type: "integer", value: 1 },
  "STATUS_RETURN_AT_EDGE": { type: "integer", value: 256 },
  "STATUS_ROTATE_X": { type: "integer", value: 2 },
  "STATUS_ROTATE_Y": { type: "integer", value: 4 },
  "STATUS_ROTATE_Z": { type: "integer", value: 8 },
  "STATUS_SANDBOX": { type: "integer", value: 32 },
  "STATUS_TYPE_MISMATCH": { type: "integer", value: 1001 },
  "STATUS_WHITELIST_FAILED": { type: "integer", value: 2001 },
  "STRING_TRIM": { type: "integer", value: 3 },
  "STRING_TRIM_HEAD": { type: "integer", value: 1 },
  "STRING_TRIM_TAIL": { type: "integer", value: 2 },
  "TARGETED_EMAIL_OBJECT_OWNER": { type: "integer", value: 2 },
  "TARGETED_EMAIL_ROOT_CREATOR": { type: "integer", value: 1 },
  "TEXTURE_BLANK": { type: "string", value: "5748decc-f629-461c-9a36-a35a221fe21f" },
  "TEXTURE_DEFAULT": { type: "string", value: "89556747-24cb-43ed-920b-47caed15465f" },
  "TEXTURE_MEDIA": { type: "string", value: "8b5fec65-8d8d-9dc5-cda8-8fdf2716e361" },
  "TEXTURE_PLYWOOD": { type: "string", value: "89556747-24cb-43ed-920b-47caed15465f" },
  "TEXTURE_TRANSPARENT": { type: "string", value: "8dcd4a48-2d37-4909-9f78-f7a9eb4ef903" },
  "TOUCH_INVALID_FACE": { type: "integer", value: -1 },
  "TOUCH_INVALID_TEXCOORD": { type: "vector", value: Object.freeze({ x: -1, y: -1, z: 0 }) },
  "TOUCH_INVALID_VECTOR": { type: "vector", value: Object.freeze({ x: 0, y: 0, z: 0 }) },
  "TP_ROUTING_BLOCKED": { type: "integer", value: 0 },
  "TP_ROUTING_FREE": { type: "integer", value: 2 },
  "TP_ROUTING_LANDINGP": { type: "integer", value: 1 },
  "TRANSFER_BAD_OPTS": { type: "integer", value: -1 },
  "TRANSFER_BAD_ROOT": { type: "integer", value: -5 },
  "TRANSFER_DEST": { type: "integer", value: 0 },
  "TRANSFER_FLAGS": { type: "integer", value: 1 },
  "TRANSFER_FLAG_COPY": { type: "integer", value: 4 },
  "TRANSFER_FLAG_RESERVED": { type: "integer", value: 1 },
  "TRANSFER_FLAG_TAKE": { type: "integer", value: 2 },
  "TRANSFER_NO_ATTACHMENT": { type: "integer", value: -7 },
  "TRANSFER_NO_ITEMS": { type: "integer", value: -4 },
  "TRANSFER_NO_PERMS": { type: "integer", value: -6 },
  "TRANSFER_NO_TARGET": { type: "integer", value: -2 },
  "TRANSFER_OK": { type: "integer", value: 0 },
  "TRANSFER_THROTTLE": { type: "integer", value: -3 },
  "TRAVERSAL_TYPE": { type: "integer", value: 7 },
  "TRAVERSAL_TYPE_FAST": { type: "integer", value: 1 },
  "TRAVERSAL_TYPE_NONE": { type: "integer", value: 2 },
  "TRAVERSAL_TYPE_SLOW": { type: "integer", value: 0 },
  "TRUE": { type: "integer", value: 1 },
  "TWO_PI": { type: "float", value: 6.2831853 },
  "TYPE_FLOAT": { type: "integer", value: 2 },
  "TYPE_INTEGER": { type: "integer", value: 1 },
  "TYPE_INVALID": { type: "integer", value: 0 },
  "TYPE_KEY": { type: "integer", value: 4 },
  "TYPE_ROTATION": { type: "integer", value: 6 },
  "TYPE_STRING": { type: "integer", value: 3 },
  "TYPE_VECTOR": { type: "integer", value: 5 },
  "URL_REQUEST_DENIED": { type: "string", value: "URL_REQUEST_DENIED" },
  "URL_REQUEST_GRANTED": { type: "string", value: "URL_REQUEST_GRANTED" },
  "VEHICLE_ANGULAR_DEFLECTION_EFFICIENCY": { type: "integer", value: 32 },
  "VEHICLE_ANGULAR_DEFLECTION_TIMESCALE": { type: "integer", value: 33 },
  "VEHICLE_ANGULAR_FRICTION_TIMESCALE": { type: "integer", value: 17 },
  "VEHICLE_ANGULAR_MOTOR_DECAY_TIMESCALE": { type: "integer", value: 35 },
  "VEHICLE_ANGULAR_MOTOR_DIRECTION": { type: "integer", value: 19 },
  "VEHICLE_ANGULAR_MOTOR_TIMESCALE": { type: "integer", value: 34 },
  "VEHICLE_BANKING_EFFICIENCY": { type: "integer", value: 38 },
  "VEHICLE_BANKING_MIX": { type: "integer", value: 39 },
  "VEHICLE_BANKING_TIMESCALE": { type: "integer", value: 40 },
  "VEHICLE_BUOYANCY": { type: "integer", value: 27 },
  "VEHICLE_FLAG_BLOCK_INTERFERENCE": { type: "integer", value: 1024 },
  "VEHICLE_FLAG_CAMERA_DECOUPLED": { type: "integer", value: 512 },
  "VEHICLE_FLAG_HOVER_GLOBAL_HEIGHT": { type: "integer", value: 16 },
  "VEHICLE_FLAG_HOVER_TERRAIN_ONLY": { type: "integer", value: 8 },
  "VEHICLE_FLAG_HOVER_UP_ONLY": { type: "integer", value: 32 },
  "VEHICLE_FLAG_HOVER_WATER_ONLY": { type: "integer", value: 4 },
  "VEHICLE_FLAG_LIMIT_MOTOR_UP": { type: "integer", value: 64 },
  "VEHICLE_FLAG_LIMIT_ROLL_ONLY": { type: "integer", value: 2 },
  "VEHICLE_FLAG_MOUSELOOK_BANK": { type: "integer", value: 256 },
  "VEHICLE_FLAG_MOUSELOOK_STEER": { type: "integer", value: 128 },
  "VEHICLE_FLAG_NO_DEFLECTION_UP": { type: "integer", value: 1 },
  "VEHICLE_FLAG_NO_FLY_UP": { type: "integer", value: 1 },
  "VEHICLE_HOVER_EFFICIENCY": { type: "integer", value: 25 },
  "VEHICLE_HOVER_HEIGHT": { type: "integer", value: 24 },
  "VEHICLE_HOVER_TIMESCALE": { type: "integer", value: 26 },
  "VEHICLE_LINEAR_DEFLECTION_EFFICIENCY": { type: "integer", value: 28 },
  "VEHICLE_LINEAR_DEFLECTION_TIMESCALE": { type: "integer", value: 29 },
  "VEHICLE_LINEAR_FRICTION_TIMESCALE": { type: "integer", value: 16 },
  "VEHICLE_LINEAR_MOTOR_DECAY_TIMESCALE": { type: "integer", value: 31 },
  "VEHICLE_LINEAR_MOTOR_DIRECTION": { type: "integer", value: 18 },
  "VEHICLE_LINEAR_MOTOR_OFFSET": { type: "integer", value: 20 },
  "VEHICLE_LINEAR_MOTOR_TIMESCALE": { type: "integer", value: 30 },
  "VEHICLE_REFERENCE_FRAME": { type: "integer", value: 44 },
  "VEHICLE_TYPE_AIRPLANE": { type: "integer", value: 4 },
  "VEHICLE_TYPE_BALLOON": { type: "integer", value: 5 },
  "VEHICLE_TYPE_BOAT": { type: "integer", value: 3 },
  "VEHICLE_TYPE_CAR": { type: "integer", value: 2 },
  "VEHICLE_TYPE_NONE": { type: "integer", value: 0 },
  "VEHICLE_TYPE_SLED": { type: "integer", value: 1 },
  "VEHICLE_VERTICAL_ATTRACTION_EFFICIENCY": { type: "integer", value: 36 },
  "VEHICLE_VERTICAL_ATTRACTION_TIMESCALE": { type: "integer", value: 37 },
  "VERTICAL": { type: "integer", value: 0 },
  "WANDER_PAUSE_AT_WAYPOINTS": { type: "integer", value: 0 },
  "WATER_BLUR_MULTIPLIER": { type: "integer", value: 100 },
  "WATER_FOG": { type: "integer", value: 101 },
  "WATER_FRESNEL": { type: "integer", value: 102 },
  "WATER_NORMAL_SCALE": { type: "integer", value: 104 },
  "WATER_NORMAL_TEXTURE": { type: "integer", value: 107 },
  "WATER_REFRACTION": { type: "integer", value: 105 },
  "WATER_TEXTURE_DEFAULTS": { type: "integer", value: 103 },
  "WATER_WAVE_DIRECTION": { type: "integer", value: 106 },
  "XP_ERROR_EXPERIENCES_DISABLED": { type: "integer", value: 2 },
  "XP_ERROR_EXPERIENCE_DISABLED": { type: "integer", value: 8 },
  "XP_ERROR_EXPERIENCE_SUSPENDED": { type: "integer", value: 9 },
  "XP_ERROR_INVALID_EXPERIENCE": { type: "integer", value: 7 },
  "XP_ERROR_INVALID_PARAMETERS": { type: "integer", value: 3 },
  "XP_ERROR_KEY_NOT_FOUND": { type: "integer", value: 14 },
  "XP_ERROR_MATURITY_EXCEEDED": { type: "integer", value: 16 },
  "XP_ERROR_NONE": { type: "integer", value: 0 },
  "XP_ERROR_NOT_FOUND": { type: "integer", value: 6 },
  "XP_ERROR_NOT_PERMITTED": { type: "integer", value: 4 },
  "XP_ERROR_NOT_PERMITTED_LAND": { type: "integer", value: 17 },
  "XP_ERROR_NO_EXPERIENCE": { type: "integer", value: 5 },
  "XP_ERROR_QUOTA_EXCEEDED": { type: "integer", value: 11 },
  "XP_ERROR_REQUEST_PERM_TIMEOUT": { type: "integer", value: 18 },
  "XP_ERROR_RETRY_UPDATE": { type: "integer", value: 15 },
  "XP_ERROR_STORAGE_EXCEPTION": { type: "integer", value: 13 },
  "XP_ERROR_STORE_DISABLED": { type: "integer", value: 12 },
  "XP_ERROR_THROTTLED": { type: "integer", value: 1 },
  "XP_ERROR_UNKNOWN_ERROR": { type: "integer", value: 10 },
  "ZERO_ROTATION": { type: "rotation", value: Object.freeze({ x: 0, y: 0, z: 0, s: 1 }) },
  "ZERO_VECTOR": { type: "vector", value: Object.freeze({ x: 0, y: 0, z: 0 }) }
};

// packages/vm/dist/script.js
var Script = class {
  ast;
  state;
  mocks = /* @__PURE__ */ Object.create(null);
  globals;
  userFunctions;
  handlersByState;
  started = false;
  /** Per-script clock facade (timer state + time reference). */
  clockView;
  host;
  linkset;
  scriptName;
  /** When false, drainQueue parks events instead of delivering them. */
  running = true;
  /** Events parked while `running === false`; replayed when re-enabled. */
  parkedEvents = [];
  constructor(ast, options = {}) {
    this.ast = ast;
    let host = options.host;
    if (!host) {
      const linkset2 = new Linkset({ owner: options.owner ?? NULL_KEY });
      const prim2 = new Prim({
        key: options.objectKey ?? deterministicKey(options.scriptName ?? options.filename ?? "script"),
        name: options.objectName ?? "Object"
      });
      linkset2.addPrim(prim2);
      host = prim2;
    }
    this.host = host;
    if (!host.linkset) {
      throw new Error("Script host prim must belong to a Linkset");
    }
    this.linkset = host.linkset;
    this.scriptName = options.scriptName ?? deriveScriptName(options.filename);
    this.clockView = new ScriptClockView(this.linkset.clock, () => this);
    const linkset = this.linkset;
    const prim = host;
    const scriptName = this.scriptName;
    const identity = {
      get owner() {
        return linkset.owner;
      },
      get objectKey() {
        return prim.key;
      },
      get objectName() {
        return prim.name;
      },
      set objectName(v) {
        prim.name = v;
      },
      get scriptName() {
        return scriptName;
      }
    };
    const filename = options.filename ?? "<inline>";
    const source = options.source ?? "";
    const coverage = options.coverage ? new CoverageCollector(buildCoveragePlan(ast, filename, source)) : null;
    this.state = {
      currentState: "default",
      chat: [],
      calls: [],
      clock: this.clockView,
      httpRequests: [],
      httpKeyCounter: 0,
      listens: [],
      listenHandleCounter: 0,
      random: new Mulberry32(options.randomSeed ?? 1),
      identity,
      linkedMessages: [],
      dataserverRequests: [],
      dataserverKeyCounter: 0,
      detectedStack: [],
      linksetData: this.linkset.linksetData,
      appearance: this.host.appearance,
      lifecycle: {
        dead: false
      },
      filename,
      source,
      coverage
    };
    if (coverage)
      coverage.hitState("default");
    if (!host.scripts.includes(this)) {
      host.addScript(this);
    }
    const constants = buildConstantsEnv();
    this.globals = constants.push();
    initGlobals(this.globals, ast.globals);
    this.userFunctions = new Map(ast.functions.map((f) => [f.name, f]));
    this.handlersByState = indexHandlers(ast);
    if (!this.handlersByState.has("default")) {
      throw new Error("LSL script has no default state");
    }
  }
  /** Current virtual time in milliseconds since linkset construction. */
  get now() {
    return this.linkset.clock.now;
  }
  /**
   * Advance the linkset clock by `ms` and fire every queued event whose
   * scheduled time is ≤ the new now (across all scripts in the linkset).
   * Convenience pass-through to `linkset.advanceTime`.
   */
  advanceTime(ms) {
    this.linkset.advanceTime(ms);
  }
  /**
   * Configured recurring timer interval in seconds, or 0 if no timer is
   * registered. Mirrors `llSetTimerEvent`'s most recent argument.
   */
  get timerInterval() {
    return this.clockView.timerIntervalMs / 1e3;
  }
  /** Current LSL state name. */
  get currentState() {
    return this.state.currentState;
  }
  /**
   * Coverage report snapshot, or null when coverage is disabled. Each call
   * returns a fresh frozen object — safe to retain across further fire()s
   * without seeing later mutations.
   */
  get coverage() {
    return this.state.coverage?.snapshot() ?? null;
  }
  /** Captured chat output (llSay/llShout/llWhisper/llOwnerSay/...). */
  get chat() {
    return this.state.chat;
  }
  /** Universal log of every ll* call this script has made. Filter with callsOf(name). */
  get calls() {
    return this.state.calls;
  }
  /** Filtered call log: only entries for `name`. */
  callsOf(name) {
    return this.state.calls.filter((c) => c.name === name);
  }
  /** Captured outgoing HTTP requests from `llHTTPRequest`. */
  get httpRequests() {
    return this.state.httpRequests;
  }
  /**
   * Feed a response to a previously captured HTTP request. Schedules an
   * `http_response` event for immediate delivery.
   */
  respondToHttp(key, response) {
    const req = this.state.httpRequests.find((r) => r.key === key);
    if (!req)
      throw new Error(`unknown HTTP request key: ${key}`);
    req.fulfilled = true;
    this.clockView.schedule(this.now, "http_response", {
      request_id: key,
      status: response.status,
      metadata: response.metadata ?? [],
      body: response.body ?? ""
    });
    this.linkset.drainQueue();
  }
  /** Convenience: respond to the most recent HTTP request. */
  respondToLastHttp(response) {
    const req = this.state.httpRequests[this.state.httpRequests.length - 1];
    if (!req)
      throw new Error("no HTTP request to respond to");
    this.respondToHttp(req.key, response);
  }
  /** Currently active listen registrations (from `llListen`). */
  get listens() {
    return this.state.listens;
  }
  /** Captured llMessageLinked invocations originating from this script. */
  get linkedMessages() {
    return this.state.linkedMessages;
  }
  /** Drop every captured outgoing linked-message entry for this script. */
  clearLinkedMessages() {
    this.state.linkedMessages.length = 0;
  }
  /** Captured pending dataserver requests (llRequestAgentData and friends). */
  get dataserverRequests() {
    return this.state.dataserverRequests;
  }
  /**
   * Feed a value back to a pending dataserver request. Schedules a
   * `dataserver` event with the request key and a string value.
   */
  respondToDataserver(key, value) {
    const req = this.state.dataserverRequests.find((r) => r.key === key);
    if (!req)
      throw new Error(`unknown dataserver request key: ${key}`);
    req.fulfilled = true;
    this.clockView.schedule(this.now, "dataserver", {
      queryid: key,
      data: value
    });
    this.linkset.drainQueue();
  }
  /** Convenience: respond to the most recent dataserver request. */
  respondToLastDataserver(value) {
    const req = this.state.dataserverRequests[this.state.dataserverRequests.length - 1];
    if (!req)
      throw new Error("no dataserver request to respond to");
    this.respondToDataserver(req.key, value);
  }
  /** Currently displayed floating text (from llSetText). null if unset. */
  get text() {
    return this.state.appearance.text;
  }
  /** Object description from llSetObjectDesc. */
  get objectDesc() {
    return this.state.appearance.description;
  }
  /**
   * Read-only view of the Linkset Data store. Tests can iterate to assert on
   * keys / values / protection. Modify via the LSL builtins or seedLinksetData.
   */
  get linksetData() {
    return this.state.linksetData;
  }
  /**
   * White-box helper: pre-populate the Linkset Data store without going
   * through llLinksetDataWrite. Does not fire linkset_data events.
   */
  seedLinksetData(entries) {
    for (const [k, v] of entries) {
      this.state.linksetData.set(k, { value: v.value, password: v.password ?? "" });
    }
  }
  /** True once `llDie()` has been called. Subsequent fire() calls are no-ops. */
  get dead() {
    return this.state.lifecycle.dead;
  }
  /**
   * Match chat against this script's listens and queue `listen` events for
   * every match. Does not drain — caller does that. Used by Linkset.deliverChat
   * for cross-script delivery.
   */
  matchChatListens(opts) {
    for (const l of this.state.listens) {
      if (!l.active)
        continue;
      if (l.channel !== opts.channel)
        continue;
      if (l.name && l.name !== opts.name)
        continue;
      if (l.key && l.key !== NULL_KEY && l.key !== opts.key)
        continue;
      if (l.message && l.message !== opts.message)
        continue;
      this.clockView.schedule(this.now, "listen", {
        channel: opts.channel,
        name: opts.name,
        id: opts.key,
        message: opts.message
      });
    }
  }
  /**
   * Deliver chat to this script only. Linkset-wide delivery (every listening
   * script in the linkset) is `linkset.deliverChat`.
   */
  deliverChat(opts) {
    this.matchChatListens(opts);
    this.linkset.drainQueue();
  }
  /**
   * Override an `ll*` function for the lifetime of this Script. Replaces
   * any built-in or stub of the same name.
   */
  mock(name, impl) {
    this.mocks[name] = impl;
  }
  /** Read a global variable's current value. White-box hook for tests. */
  global(name) {
    return this.globals.get(name).value;
  }
  /** Seed a global variable. The value is coerced to the global's declared type. */
  setGlobal(name, value, type) {
    const inferred = type ?? inferType(value);
    this.globals.set(name, { type: inferred, value });
  }
  /**
   * Drive an event into the current state.
   *
   * `payload` is keyed by the event's documented parameter names (per kwdb).
   * The handler's declared parameters bind by position to the event spec, so
   * the user's chosen names don't have to match.
   *
   * Synchronous: runs the handler to completion before returning, including
   * any state transitions triggered by `state foo;` (state_exit / change /
   * state_entry chain runs before fire() returns).
   *
   * If the current state has no handler for `eventName`, this is a no-op
   * — matches LSL behavior of silently dropping unhandled events.
   */
  fire(eventName, payload = {}) {
    if (this.state.lifecycle.dead)
      return;
    if (!this.started) {
      this.started = true;
      const entry2 = this.handlersByState.get(this.state.currentState)?.get("state_entry");
      if (entry2 && eventName !== "state_entry") {
        this.runHandler(entry2, []);
        this.linkset.drainQueue();
      }
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(eventName);
    if (handler) {
      const args = bindPayload(eventName, payload);
      this.withDetected(payload, () => this.runHandler(handler, args));
    }
    this.linkset.drainQueue();
  }
  /**
   * Run state_entry of the default state. If the script has been auto-started
   * (e.g. by an earlier fire), this is a no-op.
   */
  start() {
    if (this.state.lifecycle.dead)
      return;
    if (this.started)
      return;
    this.started = true;
    const entry2 = this.handlersByState.get("default")?.get("state_entry");
    if (entry2) {
      this.runHandler(entry2, []);
    }
    this.linkset.drainQueue();
  }
  /**
   * Reset the script as if `llResetScript` had been called: clear globals,
   * reseed them from the AST initializers, return to the default state,
   * cancel timers, and run state_entry. Used internally when llResetScript
   * is invoked from inside a handler; tests can also call it directly.
   */
  reset() {
    this.globals.clear();
    initGlobals(this.globals, this.ast.globals);
    this.state.currentState = "default";
    this.state.lifecycle.dead = false;
    this.clockView.cancelTimer();
    this.linkset.clock.purgeTarget(this);
    this.parkedEvents.length = 0;
    this.started = false;
    if (this.state.coverage)
      this.state.coverage.hitState("default");
    if (this.running)
      this.start();
  }
  /**
   * Internal: invoked by `Linkset.drainQueue` to deliver one queued event.
   * The synthetic `__reset` event triggers a sibling-initiated reset
   * (scheduled by `llResetOtherScript`).
   */
  deliver(event, payload) {
    if (this.state.lifecycle.dead)
      return;
    if (event === "__reset") {
      this.reset();
      return;
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(event);
    if (!handler)
      return;
    const args = bindPayload(event, payload);
    this.withDetected(payload, () => this.runHandler(handler, args));
  }
  /**
   * Push a detected context (if the payload includes `detected`) for the
   * duration of `fn`, so llDetectedKey / Name / Pos / etc. inside the
   * handler resolve to the right entries.
   */
  withDetected(payload, fn) {
    const detected = payload["detected"];
    if (!Array.isArray(detected) || detected.length === 0) {
      fn();
      return;
    }
    this.state.detectedStack.push({ entries: detected });
    try {
      fn();
    } finally {
      this.state.detectedStack.pop();
    }
  }
  /**
   * Run a handler and process any state-change signal it raises.
   *
   * LSL semantics: when a handler executes `state foo;`, control leaves the
   * handler immediately, the current state's `state_exit` fires, the state
   * changes, then the new state's `state_entry` fires. We mirror that here
   * with a small loop so that a `state_exit` or `state_entry` that itself
   * does `state foo;` continues the chain correctly.
   */
  runHandler(handler, args) {
    const ctx = {
      state: this.state,
      mocks: this.mocks,
      globals: this.globals,
      userFunctions: this.userFunctions,
      script: this,
      prim: this.host,
      linkset: this.linkset
    };
    let pending = {
      handler,
      args
    };
    while (pending) {
      const { handler: h, args: a } = pending;
      pending = null;
      try {
        execHandler(ctx, h, a);
      } catch (e) {
        if (e instanceof ResetScriptSignal) {
          this.reset();
          return;
        }
        if (!(e instanceof StateChangeSignal))
          throw e;
        const target = e.target;
        const exit = this.handlersByState.get(this.state.currentState)?.get("state_exit");
        if (exit) {
          try {
            execHandler(ctx, exit, []);
          } catch (e2) {
            if (e2 instanceof StateChangeSignal) {
            } else {
              throw e2;
            }
          }
        }
        if (!this.handlersByState.has(target)) {
          throw new Error(`unknown state '${target}' in state change`);
        }
        this.state.currentState = target;
        if (this.state.coverage)
          this.state.coverage.hitState(target);
        const entry2 = this.handlersByState.get(target)?.get("state_entry");
        if (entry2) {
          pending = { handler: entry2, args: [] };
        }
      }
    }
  }
  /**
   * Mark this script as dead and cancel its timer. Used by llDie to bring
   * down every script in the linkset. Idempotent.
   */
  markDead() {
    this.state.lifecycle.dead = true;
    this.clockView.cancelTimer();
  }
  /**
   * Replay any events parked while this script was disabled. Caller is
   * responsible for advancing the linkset clock if needed afterwards.
   */
  resumeParked() {
    if (!this.running)
      return;
    if (this.parkedEvents.length === 0)
      return;
    const events = this.parkedEvents.splice(0, this.parkedEvents.length);
    const at = this.now;
    for (const e of events) {
      this.clockView.schedule(at, e.event, e.payload);
    }
  }
};
function bindPayload(eventName, payload) {
  const spec = EVENT_SPECS[eventName];
  if (!spec)
    return [];
  const args = [];
  for (const p of spec.params) {
    const v = payload[p.name];
    if (v === void 0) {
      args.push(defaultEvalFor(p.type));
    } else {
      args.push({ type: p.type, value: v });
    }
  }
  return args;
}
function indexHandlers(ast) {
  const out = /* @__PURE__ */ new Map();
  for (const s of ast.states) {
    const map = /* @__PURE__ */ new Map();
    for (const h of s.handlers) {
      map.set(h.name, h);
    }
    out.set(s.name, map);
  }
  return out;
}
function initGlobals(env, globals) {
  for (const g of globals) {
    let init;
    if (g.init) {
      init = literalToEval(g.init, g.typeName);
    }
    env.declare(g.name, g.typeName, init);
  }
}
function literalToEval(expr, declared) {
  switch (expr.kind) {
    case "IntegerLiteral":
      return { type: "integer", value: expr.value | 0 };
    case "FloatLiteral":
      return { type: "float", value: expr.value };
    case "StringLiteral":
      return { type: "string", value: expr.value };
    case "Identifier": {
      const c = CONSTANT_TABLE[expr.name];
      if (!c)
        return void 0;
      return { type: c.type, value: c.value };
    }
    case "VectorLiteral": {
      const x = literalToNumber(expr.x);
      const y = literalToNumber(expr.y);
      const z = literalToNumber(expr.z);
      if (x === null || y === null || z === null)
        return void 0;
      return { type: "vector", value: { x, y, z } };
    }
    case "RotationLiteral": {
      const x = literalToNumber(expr.x);
      const y = literalToNumber(expr.y);
      const z = literalToNumber(expr.z);
      const s = literalToNumber(expr.s);
      if (x === null || y === null || z === null || s === null)
        return void 0;
      return { type: "rotation", value: { x, y, z, s } };
    }
    case "ListLiteral": {
      const elems = [];
      for (const el of expr.elements) {
        const r = literalToEval(el, "integer");
        if (!r)
          return void 0;
        elems.push(r.value);
      }
      return { type: "list", value: elems };
    }
    case "UnaryExpression": {
      const inner = literalToEval(expr.argument, declared);
      if (!inner)
        return void 0;
      if (expr.operator === "-" && (inner.type === "integer" || inner.type === "float")) {
        return { ...inner, value: -inner.value };
      }
      return inner;
    }
    default:
      return void 0;
  }
}
function literalToNumber(expr) {
  if (expr.kind === "IntegerLiteral")
    return expr.value | 0;
  if (expr.kind === "FloatLiteral")
    return expr.value;
  if (expr.kind === "Identifier") {
    const c = CONSTANT_TABLE[expr.name];
    if (c && typeof c.value === "number")
      return c.value;
    return null;
  }
  if (expr.kind === "UnaryExpression" && expr.operator === "-") {
    const n = literalToNumber(expr.argument);
    return n === null ? null : -n;
  }
  if (expr.kind === "UnaryExpression" && expr.operator === "+") {
    return literalToNumber(expr.argument);
  }
  return null;
}
function deterministicKey(seed) {
  let h1 = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  let h2 = (h1 ^ 3735928559) >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h2 ^= seed.charCodeAt(i) << (i & 31);
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function deriveScriptName(filename) {
  if (!filename)
    return "script";
  const last = filename.split("/").pop() ?? filename;
  return last.replace(/\.lsl$/i, "");
}
function inferType(v) {
  if (typeof v === "number") {
    return Number.isInteger(v) ? "integer" : "float";
  }
  if (typeof v === "string")
    return "string";
  if (Array.isArray(v))
    return "list";
  if (v && typeof v === "object" && "s" in v)
    return "rotation";
  return "vector";
}
function buildConstantsEnv() {
  const env = new Env(null);
  for (const [name, entry2] of Object.entries(CONSTANT_TABLE)) {
    env.declare(name, entry2.type, {
      type: entry2.type,
      value: entry2.value
    });
  }
  return env;
}

// packages/vitest/src/loadScript.ts
import { readFile } from "fs/promises";

// packages/parser/dist/lexer.js
var KEYWORDS = /* @__PURE__ */ new Set([
  // types (also valid as identifiers in cast expressions; parser disambiguates)
  "integer",
  "float",
  "string",
  "key",
  "vector",
  "rotation",
  "quaternion",
  "list",
  // control flow + structure
  "default",
  "state",
  "if",
  "else",
  "while",
  "do",
  "for",
  "return",
  "jump"
]);
var PUNCT_MAP = {
  "(": "lparen",
  ")": "rparen",
  "{": "lbrace",
  "}": "rbrace",
  "[": "lbracket",
  "]": "rbracket",
  ",": "comma",
  ";": "semi",
  ".": "dot",
  ":": "colon",
  "@": "at"
};
var MULTI_OPS = [
  "<<=",
  ">>=",
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%="
];
var SINGLE_OPS = /* @__PURE__ */ new Set(["+", "-", "*", "/", "%", "=", "<", ">", "!", "&", "|", "^", "~"]);
function lex(source, filename) {
  const tokens = [];
  const diagnostics = [];
  let i = 0;
  let line = 1;
  let col = 1;
  function loc() {
    return { line, col, offset: i };
  }
  function advance(n = 1) {
    for (let k = 0; k < n; k++) {
      const ch = source[i++];
      if (ch === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
  }
  function pushErr(message, at) {
    diagnostics.push({ severity: "error", message, filename, loc: at });
  }
  while (i < source.length) {
    const ch = source[i];
    const start = loc();
    if (ch === " " || ch === "	" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n")
        advance();
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      advance(2);
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        advance();
      }
      if (i >= source.length) {
        pushErr("unterminated block comment", start);
      } else {
        advance(2);
      }
      continue;
    }
    if (ch === '"') {
      advance();
      let value = "";
      while (i < source.length && source[i] !== '"') {
        const c = source[i];
        if (c === "\\") {
          advance();
          const esc = source[i];
          if (esc === void 0)
            break;
          if (esc === "n")
            value += "\n";
          else if (esc === "t")
            value += "	";
          else if (esc === "\\")
            value += "\\";
          else if (esc === '"')
            value += '"';
          else
            value += esc;
          advance();
        } else {
          value += c;
          advance();
        }
      }
      if (i >= source.length) {
        pushErr("unterminated string literal", start);
      } else {
        advance();
      }
      tokens.push({
        kind: "string",
        text: source.slice(start.offset, i),
        loc: start,
        value
      });
      continue;
    }
    if (isDigit(ch) || ch === "." && isDigit(source[i + 1] ?? "")) {
      let s = "";
      if (ch === "0" && (source[i + 1] === "x" || source[i + 1] === "X")) {
        s += source[i];
        s += source[i + 1];
        advance(2);
        const digitsStart = s.length;
        while (i < source.length && /[0-9a-fA-F]/.test(source[i])) {
          s += source[i];
          advance();
        }
        if (s.length === digitsStart) {
          pushErr("malformed hex literal \u2014 expected at least one hex digit after 0x", start);
          tokens.push({ kind: "integer", text: s, loc: start, value: 0 });
        } else {
          tokens.push({ kind: "integer", text: s, loc: start, value: Number.parseInt(s, 16) });
        }
        continue;
      }
      let isFloat = false;
      while (i < source.length && isDigit(source[i])) {
        s += source[i];
        advance();
      }
      if (source[i] === ".") {
        isFloat = true;
        s += ".";
        advance();
        while (i < source.length && isDigit(source[i])) {
          s += source[i];
          advance();
        }
      }
      if (source[i] === "e" || source[i] === "E") {
        let j = i + 1;
        if (source[j] === "+" || source[j] === "-")
          j++;
        if (j < source.length && isDigit(source[j])) {
          isFloat = true;
          s += source[i];
          advance();
          if (source[i] === "+" || source[i] === "-") {
            s += source[i];
            advance();
          }
          while (i < source.length && isDigit(source[i])) {
            s += source[i];
            advance();
          }
        }
      }
      tokens.push({
        kind: isFloat ? "float" : "integer",
        text: s,
        loc: start,
        value: isFloat ? Number.parseFloat(s) : Number.parseInt(s, 10)
      });
      continue;
    }
    if (isIdStart(ch)) {
      let s = "";
      while (i < source.length && isIdCont(source[i])) {
        s += source[i];
        advance();
      }
      const kind = KEYWORDS.has(s) ? "keyword" : "identifier";
      tokens.push({ kind, text: s, loc: start });
      continue;
    }
    if (PUNCT_MAP[ch]) {
      tokens.push({ kind: PUNCT_MAP[ch], text: ch, loc: start });
      advance();
      continue;
    }
    let matched = false;
    for (const op of MULTI_OPS) {
      if (source.startsWith(op, i)) {
        tokens.push({ kind: "op", text: op, loc: start });
        advance(op.length);
        matched = true;
        break;
      }
    }
    if (matched)
      continue;
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ kind: "op", text: ch, loc: start });
      advance();
      continue;
    }
    pushErr(`unexpected character '${ch}'`, start);
    advance();
  }
  tokens.push({ kind: "eof", text: "", loc: loc() });
  return { tokens, diagnostics };
}
function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isIdStart(ch) {
  return ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_";
}
function isIdCont(ch) {
  return isIdStart(ch) || isDigit(ch);
}

// packages/parser/dist/parser.js
var TYPE_KEYWORDS = /* @__PURE__ */ new Set([
  "integer",
  "float",
  "string",
  "key",
  "vector",
  "rotation",
  "list"
]);
var ASSIGN_OPS = /* @__PURE__ */ new Set(["=", "+=", "-=", "*=", "/=", "%="]);
var Parser2 = class {
  tokens;
  filename;
  pos = 0;
  diags = [];
  constructor(tokens, filename) {
    this.tokens = tokens;
    this.filename = filename;
  }
  parseScript() {
    const start = this.peek().loc;
    const globals = [];
    const functions = [];
    const states = [];
    while (!this.isEOF()) {
      const decl = this.parseTopLevel();
      if (decl) {
        if (decl.kind === "GlobalVariable")
          globals.push(decl);
        else if (decl.kind === "FunctionDeclaration")
          functions.push(decl);
        else
          states.push(decl);
      } else {
        this.recoverToTopLevel();
      }
    }
    return {
      script: { kind: "Script", loc: start, globals, functions, states },
      diagnostics: this.diags
    };
  }
  parseTopLevel() {
    const t = this.peek();
    if (t.kind === "keyword" && TYPE_KEYWORDS.has(t.text)) {
      const next = this.tokens[this.pos + 2];
      if (next && next.kind === "lparen") {
        return this.parseFunctionDeclaration();
      }
      return this.parseGlobalVariable();
    }
    if (t.kind === "identifier") {
      const next = this.tokens[this.pos + 1];
      if (next && next.kind === "lparen") {
        return this.parseFunctionDeclaration();
      }
      this.diag(`expected state, function, or global at top level (got '${t.text}')`, t.loc);
      return null;
    }
    if (t.kind === "keyword" && (t.text === "default" || t.text === "state")) {
      return this.parseState();
    }
    this.diag(`expected top-level declaration (got '${t.text}')`, t.loc);
    return null;
  }
  parseFunctionDeclaration() {
    let returnType = null;
    let startLoc;
    if (this.atTypeKeyword()) {
      const t = this.advance();
      returnType = t.text;
      startLoc = t.loc;
    } else {
      startLoc = this.peek().loc;
    }
    const name = this.expect("identifier", "expected function name");
    if (!name)
      return null;
    if (!this.expect("lparen", "expected '(' after function name"))
      return null;
    const params = [];
    if (!this.check("rparen")) {
      while (!this.isEOF()) {
        const p = this.parseParam();
        if (!p)
          return null;
        params.push(p);
        if (this.check("comma")) {
          this.advance();
          continue;
        }
        break;
      }
    }
    if (!this.expect("rparen", "expected ')' to close parameter list"))
      return null;
    const body = this.parseBlock();
    if (!body)
      return null;
    return {
      kind: "FunctionDeclaration",
      loc: startLoc,
      returnType,
      name: name.text,
      params,
      body
    };
  }
  // ---- Top level ----
  parseGlobalVariable() {
    const t = this.expectKeyword(TYPE_KEYWORDS, "expected global variable type");
    if (!t)
      return null;
    const name = this.expect("identifier", "expected global variable name");
    if (!name)
      return null;
    let init = null;
    if (this.checkOp("=")) {
      this.advance();
      const e = this.parseExpression();
      if (!e)
        return null;
      init = e;
    }
    if (!this.expect("semi", "expected ';' after global variable declaration"))
      return null;
    return {
      kind: "GlobalVariable",
      loc: t.loc,
      typeName: t.text,
      name: name.text,
      init
    };
  }
  parseState() {
    const tok = this.peek();
    let name;
    let nameLoc;
    if (tok.kind === "keyword" && tok.text === "default") {
      name = "default";
      nameLoc = tok.loc;
      this.advance();
    } else if (tok.kind === "keyword" && tok.text === "state") {
      this.advance();
      const id = this.expect("identifier", "expected state name after `state`");
      if (!id)
        return null;
      name = id.text;
      nameLoc = id.loc;
    } else {
      this.diag(`expected state declaration, got '${tok.text}'`, tok.loc);
      return null;
    }
    if (!this.expect("lbrace", "expected '{' to open state body"))
      return null;
    const handlers = [];
    while (!this.check("rbrace") && !this.isEOF()) {
      const h = this.parseEventHandler();
      if (h)
        handlers.push(h);
      else
        this.recoverInsideBlock();
    }
    this.expect("rbrace", "expected '}' to close state body");
    return { kind: "State", loc: nameLoc, name, handlers };
  }
  parseEventHandler() {
    const id = this.expect("identifier", "expected event handler name");
    if (!id)
      return null;
    if (!this.expect("lparen", "expected '(' after event handler name"))
      return null;
    const params = [];
    if (!this.check("rparen")) {
      while (!this.isEOF()) {
        const p = this.parseParam();
        if (!p)
          return null;
        params.push(p);
        if (this.check("comma")) {
          this.advance();
          continue;
        }
        break;
      }
    }
    if (!this.expect("rparen", "expected ')' to close parameter list"))
      return null;
    const body = this.parseBlock();
    if (!body)
      return null;
    return {
      kind: "EventHandler",
      loc: id.loc,
      name: id.text,
      params,
      body
    };
  }
  parseParam() {
    const t = this.peek();
    if (t.kind !== "keyword" || !TYPE_KEYWORDS.has(t.text)) {
      this.diag(`expected parameter type, got '${t.text}'`, t.loc);
      return null;
    }
    this.advance();
    const name = this.expect("identifier", "expected parameter name");
    if (!name)
      return null;
    return { kind: "Param", loc: t.loc, typeName: t.text, name: name.text };
  }
  // ---- Statements ----
  parseBlock() {
    const open = this.expect("lbrace", "expected '{' to open block");
    if (!open)
      return null;
    const body = [];
    while (!this.check("rbrace") && !this.isEOF()) {
      const s = this.parseStatement();
      if (s)
        body.push(s);
      else
        this.recoverInsideBlock();
    }
    this.expect("rbrace", "expected '}' to close block");
    return { kind: "BlockStatement", loc: open.loc, body };
  }
  parseStatement() {
    const t = this.peek();
    if (this.atTypeKeyword()) {
      return this.parseVariableDeclaration();
    }
    if (t.kind === "lbrace")
      return this.parseBlock();
    if (t.kind === "keyword") {
      switch (t.text) {
        case "if":
          return this.parseIf();
        case "while":
          return this.parseWhile();
        case "do":
          return this.parseDoWhile();
        case "for":
          return this.parseFor();
        case "return":
          return this.parseReturn();
        case "state":
          return this.parseStateChange();
        case "jump":
          return this.parseJump();
      }
    }
    if (t.kind === "at")
      return this.parseLabel();
    const expr = this.parseExpression();
    if (!expr)
      return null;
    if (!this.expect("semi", "expected ';' after expression statement"))
      return null;
    const stmt = {
      kind: "ExpressionStatement",
      loc: expr.loc,
      expression: expr
    };
    return stmt;
  }
  parseVariableDeclaration() {
    const t = this.advance();
    const name = this.expect("identifier", "expected variable name");
    if (!name)
      return null;
    let init = null;
    if (this.checkOp("=")) {
      this.advance();
      const e = this.parseExpression();
      if (!e)
        return null;
      init = e;
    }
    if (!this.expect("semi", "expected ';' after variable declaration"))
      return null;
    return {
      kind: "VariableDeclaration",
      loc: t.loc,
      typeName: t.text,
      name: name.text,
      init
    };
  }
  parseIf() {
    const start = this.advance();
    if (!this.expect("lparen", "expected '(' after 'if'"))
      return null;
    const test = this.parseExpression();
    if (!test)
      return null;
    if (!this.expect("rparen", "expected ')' after if condition"))
      return null;
    const consequent = this.parseStatement();
    if (!consequent)
      return null;
    let alternate = null;
    if (this.peek().kind === "keyword" && this.peek().text === "else") {
      this.advance();
      alternate = this.parseStatement();
      if (!alternate)
        return null;
    }
    return { kind: "IfStatement", loc: start.loc, test, consequent, alternate };
  }
  parseWhile() {
    const start = this.advance();
    if (!this.expect("lparen", "expected '(' after 'while'"))
      return null;
    const test = this.parseExpression();
    if (!test)
      return null;
    if (!this.expect("rparen", "expected ')' after while condition"))
      return null;
    const body = this.parseStatement();
    if (!body)
      return null;
    return { kind: "WhileStatement", loc: start.loc, test, body };
  }
  parseDoWhile() {
    const start = this.advance();
    const body = this.parseStatement();
    if (!body)
      return null;
    if (!(this.peek().kind === "keyword" && this.peek().text === "while")) {
      this.diag(`expected 'while' after 'do' body`, this.peek().loc);
      return null;
    }
    this.advance();
    if (!this.expect("lparen", "expected '(' after 'while'"))
      return null;
    const test = this.parseExpression();
    if (!test)
      return null;
    if (!this.expect("rparen", "expected ')' after while condition"))
      return null;
    if (!this.expect("semi", "expected ';' after do-while statement"))
      return null;
    return { kind: "DoWhileStatement", loc: start.loc, body, test };
  }
  parseFor() {
    const start = this.advance();
    if (!this.expect("lparen", "expected '(' after 'for'"))
      return null;
    const init = this.parseExpressionList("semi");
    if (!this.expect("semi", "expected ';' after for-init"))
      return null;
    let test = null;
    if (!this.check("semi")) {
      test = this.parseExpression();
      if (!test)
        return null;
    }
    if (!this.expect("semi", "expected ';' after for-test"))
      return null;
    const update = this.parseExpressionList("rparen");
    if (!this.expect("rparen", "expected ')' to close for-header"))
      return null;
    const body = this.parseStatement();
    if (!body)
      return null;
    return { kind: "ForStatement", loc: start.loc, init, test, update, body };
  }
  parseReturn() {
    const start = this.advance();
    let argument = null;
    if (!this.check("semi")) {
      argument = this.parseExpression();
      if (!argument)
        return null;
    }
    if (!this.expect("semi", "expected ';' after return statement"))
      return null;
    return { kind: "ReturnStatement", loc: start.loc, argument };
  }
  parseStateChange() {
    const start = this.advance();
    const t = this.peek();
    let target;
    if (t.kind === "identifier") {
      this.advance();
      target = t.text;
    } else if (t.kind === "keyword" && t.text === "default") {
      this.advance();
      target = "default";
    } else {
      this.diag(`expected state name after 'state' (got '${t.text}')`, t.loc);
      return null;
    }
    if (!this.expect("semi", "expected ';' after state change"))
      return null;
    return { kind: "StateChangeStatement", loc: start.loc, target };
  }
  parseJump() {
    const start = this.advance();
    const id = this.expect("identifier", "expected label name after 'jump'");
    if (!id)
      return null;
    if (!this.expect("semi", "expected ';' after jump statement"))
      return null;
    return { kind: "JumpStatement", loc: start.loc, label: id.text };
  }
  parseLabel() {
    const start = this.advance();
    const id = this.expect("identifier", "expected label name after '@'");
    if (!id)
      return null;
    if (!this.expect("semi", "expected ';' after label declaration"))
      return null;
    return { kind: "LabelStatement", loc: start.loc, name: id.text };
  }
  /** Parse 0+ comma-separated expressions, stopping (without consuming) at `terminator`. */
  parseExpressionList(terminator) {
    const out = [];
    if (this.check(terminator))
      return out;
    while (!this.isEOF()) {
      const e = this.parseExpression();
      if (!e)
        return out;
      out.push(e);
      if (this.check("comma")) {
        this.advance();
        continue;
      }
      break;
    }
    return out;
  }
  // ---- Expressions (precedence climbing) ----
  // Lowest precedence at top, highest at bottom.
  parseExpression() {
    return this.parseAssignment();
  }
  parseAssignment() {
    const left = this.parseLogicalOr();
    if (!left)
      return null;
    if (this.peek().kind === "op" && ASSIGN_OPS.has(this.peek().text)) {
      const op = this.advance();
      const value = this.parseAssignment();
      if (!value)
        return null;
      return {
        kind: "AssignmentExpression",
        loc: left.loc,
        operator: op.text,
        target: left,
        value
      };
    }
    return left;
  }
  parseLogicalOr() {
    return this.parseBinaryLeft(["||"], () => this.parseLogicalAnd());
  }
  parseLogicalAnd() {
    return this.parseBinaryLeft(["&&"], () => this.parseBitwiseOr());
  }
  parseBitwiseOr() {
    return this.parseBinaryLeft(["|"], () => this.parseBitwiseXor());
  }
  parseBitwiseXor() {
    return this.parseBinaryLeft(["^"], () => this.parseBitwiseAnd());
  }
  parseBitwiseAnd() {
    return this.parseBinaryLeft(["&"], () => this.parseEquality());
  }
  parseEquality() {
    return this.parseBinaryLeft(["==", "!="], () => this.parseRelational());
  }
  parseRelational() {
    return this.parseBinaryLeft(["<", ">", "<=", ">="], () => this.parseShift());
  }
  parseShift() {
    return this.parseBinaryLeft(["<<", ">>"], () => this.parseAdditive());
  }
  parseAdditive() {
    return this.parseBinaryLeft(["+", "-"], () => this.parseMultiplicative());
  }
  parseMultiplicative() {
    return this.parseBinaryLeft(["*", "/", "%"], () => this.parseCast());
  }
  parseBinaryLeft(ops, next) {
    let left = next();
    if (!left)
      return null;
    while (this.peek().kind === "op" && ops.includes(this.peek().text)) {
      const op = this.advance();
      const right = next();
      if (!right)
        return null;
      left = {
        kind: "BinaryExpression",
        loc: left.loc,
        operator: op.text,
        left,
        right
      };
    }
    return left;
  }
  parseCast() {
    if (this.check("lparen")) {
      const next = this.tokens[this.pos + 1];
      const after = this.tokens[this.pos + 2];
      if (next && next.kind === "keyword" && TYPE_KEYWORDS.has(next.text) && after && after.kind === "rparen") {
        const start = this.advance();
        const ty = this.advance();
        this.advance();
        const arg = this.parseCast();
        if (!arg)
          return null;
        return {
          kind: "CastExpression",
          loc: start.loc,
          targetType: ty.text,
          argument: arg
        };
      }
    }
    return this.parseUnary();
  }
  parseUnary() {
    const t = this.peek();
    if (t.kind === "op") {
      if (t.text === "-" || t.text === "+" || t.text === "!" || t.text === "~") {
        this.advance();
        const arg = this.parseUnary();
        if (!arg)
          return null;
        return {
          kind: "UnaryExpression",
          loc: t.loc,
          operator: t.text,
          argument: arg
        };
      }
      if (t.text === "++" || t.text === "--") {
        this.advance();
        const arg = this.parseUnary();
        if (!arg)
          return null;
        const upd = {
          kind: "UpdateExpression",
          loc: t.loc,
          operator: t.text,
          prefix: true,
          argument: arg
        };
        return upd;
      }
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let expr = this.parsePrimary();
    if (!expr)
      return null;
    while (true) {
      const t = this.peek();
      if (t.kind === "op" && (t.text === "++" || t.text === "--")) {
        this.advance();
        const upd = {
          kind: "UpdateExpression",
          loc: t.loc,
          operator: t.text,
          prefix: false,
          argument: expr
        };
        expr = upd;
        continue;
      }
      if (t.kind === "dot") {
        this.advance();
        const id = this.expect("identifier", "expected member name after '.'");
        if (!id)
          return null;
        expr = {
          kind: "MemberExpression",
          loc: t.loc,
          object: expr,
          property: id.text
        };
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrimary() {
    const t = this.peek();
    if (t.kind === "integer") {
      this.advance();
      return { kind: "IntegerLiteral", loc: t.loc, value: t.value };
    }
    if (t.kind === "float") {
      this.advance();
      return { kind: "FloatLiteral", loc: t.loc, value: t.value };
    }
    if (t.kind === "string") {
      this.advance();
      return { kind: "StringLiteral", loc: t.loc, value: t.value };
    }
    if (t.kind === "identifier") {
      this.advance();
      if (this.check("lparen")) {
        this.advance();
        const args = this.parseExpressionList("rparen");
        if (!this.expect("rparen", "expected ')' to close call argument list"))
          return null;
        const call = {
          kind: "CallExpression",
          loc: t.loc,
          callee: t.text,
          args
        };
        return call;
      }
      return { kind: "Identifier", loc: t.loc, name: t.text };
    }
    if (t.kind === "lparen") {
      this.advance();
      const inner = this.parseExpression();
      if (!inner)
        return null;
      if (!this.expect("rparen", "expected ')'"))
        return null;
      return inner;
    }
    if (t.kind === "lbracket") {
      return this.parseListLiteral();
    }
    if (t.kind === "op" && t.text === "<") {
      return this.parseVectorOrRotationLiteral();
    }
    this.diag(`unexpected token '${t.text}' in expression`, t.loc);
    return null;
  }
  parseListLiteral() {
    const start = this.advance();
    const elements = this.parseExpressionList("rbracket");
    if (!this.expect("rbracket", "expected ']' to close list literal"))
      return null;
    return { kind: "ListLiteral", loc: start.loc, elements };
  }
  /**
   * Vector `<x, y, z>` or rotation `<x, y, z, s>`.
   * Components parse at additive precedence so relational `<`/`>` inside
   * components must be parenthesised — matches LSL convention.
   */
  parseVectorOrRotationLiteral() {
    const start = this.advance();
    const x = this.parseAdditive();
    if (!x)
      return null;
    if (!this.expect("comma", "expected ',' in vector/rotation literal"))
      return null;
    const y = this.parseAdditive();
    if (!y)
      return null;
    if (!this.expect("comma", "expected ',' in vector/rotation literal"))
      return null;
    const z = this.parseAdditive();
    if (!z)
      return null;
    if (this.check("comma")) {
      this.advance();
      const s = this.parseAdditive();
      if (!s)
        return null;
      if (!this.expectOp(">", "expected '>' to close rotation literal"))
        return null;
      return { kind: "RotationLiteral", loc: start.loc, x, y, z, s };
    }
    if (!this.expectOp(">", "expected '>' to close vector literal"))
      return null;
    return { kind: "VectorLiteral", loc: start.loc, x, y, z };
  }
  // ---- token helpers ----
  peek() {
    return this.tokens[this.pos];
  }
  advance() {
    const t = this.tokens[this.pos];
    if (t.kind !== "eof")
      this.pos++;
    return t;
  }
  isEOF() {
    return this.peek().kind === "eof";
  }
  check(kind) {
    return this.peek().kind === kind;
  }
  checkOp(text) {
    const t = this.peek();
    return t.kind === "op" && t.text === text;
  }
  atTypeKeyword() {
    const t = this.peek();
    return t.kind === "keyword" && TYPE_KEYWORDS.has(t.text);
  }
  expect(kind, message) {
    const t = this.peek();
    if (t.kind === kind) {
      return this.advance();
    }
    this.diag(`${message} (got '${t.text}')`, t.loc);
    return null;
  }
  expectOp(text, message) {
    const t = this.peek();
    if (t.kind === "op" && t.text === text)
      return this.advance();
    this.diag(`${message} (got '${t.text}')`, t.loc);
    return null;
  }
  expectKeyword(allowed, message) {
    const t = this.peek();
    if (t.kind === "keyword" && allowed.has(t.text))
      return this.advance();
    this.diag(`${message} (got '${t.text}')`, t.loc);
    return null;
  }
  diag(message, loc) {
    this.diags.push({ severity: "error", message, filename: this.filename, loc });
  }
  // ---- recovery ----
  recoverToTopLevel() {
    while (!this.isEOF()) {
      const t = this.peek();
      if (t.kind === "keyword" && (t.text === "default" || t.text === "state" || TYPE_KEYWORDS.has(t.text)))
        return;
      this.advance();
    }
  }
  recoverInsideBlock() {
    let depth = 0;
    while (!this.isEOF()) {
      const t = this.peek();
      if (t.kind === "lbrace")
        depth++;
      else if (t.kind === "rbrace") {
        if (depth === 0)
          return;
        depth--;
      } else if (t.kind === "semi" && depth === 0) {
        this.advance();
        return;
      }
      this.advance();
    }
  }
};
function parse(source, filename) {
  const lexed = lex(source, filename);
  const parser = new Parser2(lexed.tokens, filename);
  const { script, diagnostics } = parser.parseScript();
  return {
    script,
    diagnostics: [...lexed.diagnostics, ...diagnostics]
  };
}

// packages/parser/dist/diagnostics.js
var LslParseError = class extends Error {
  diagnostics;
  constructor(diagnostics) {
    const first = diagnostics[0];
    const detail = first ? `${first.filename}:${first.loc.line}:${first.loc.col}: ${first.message}` : "unknown parse error";
    super(`LSL parse error: ${detail}`);
    this.diagnostics = diagnostics;
    this.name = "LslParseError";
  }
};

// packages/vitest/src/coverage-config.ts
function isCoverageEnabled() {
  return process.env["LSL_COVERAGE"] === "1";
}

// packages/vitest/src/coverage-registry.ts
import * as fs from "fs";
import * as path from "path";
var liveScripts = /* @__PURE__ */ new Set();
var exitHookInstalled = false;
function dumpDir() {
  return process.env["LSL_COVERAGE_DIR"] ?? path.join(process.cwd(), ".lslvm-coverage");
}
function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on("exit", () => {
    const reports = drainSnapshots();
    if (reports.length === 0) return;
    try {
      const dir = dumpDir();
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
      fs.writeFileSync(file, JSON.stringify(reports));
    } catch {
    }
  });
}
function registerScript(script) {
  installExitHook();
  liveScripts.add(script);
}
function drainSnapshots() {
  const out = [];
  for (const s of liveScripts) {
    const r = s.coverage;
    if (r) out.push(r);
  }
  liveScripts.clear();
  return out;
}

// packages/vitest/src/loadScript.ts
async function loadScript(input) {
  let source;
  let filename;
  let baseOptions;
  if (typeof input === "string") {
    source = await readFile(input, "utf8");
    filename = input;
    baseOptions = { filename };
  } else {
    source = input.source;
    filename = input.filename ?? "<inline>";
    baseOptions = { ...input, filename };
  }
  const { script: ast, diagnostics } = parse(source, filename);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new LslParseError(errors);
  }
  const coverage = baseOptions.coverage ?? isCoverageEnabled();
  const options = { ...baseOptions, source, coverage };
  const script = new Script(ast, options);
  if (coverage) registerScript(script);
  return script;
}

// packages/vitest/src/loadLinkset.ts
import { readFile as readFile2 } from "fs/promises";
async function readScriptSource(src) {
  if (typeof src === "string") {
    return { source: await readFile2(src, "utf8"), filename: src };
  }
  return { source: src.source, filename: src.filename ?? "<inline>" };
}
async function loadLinkset(input) {
  const linksetOpts = {};
  if (input.owner !== void 0) linksetOpts.owner = input.owner;
  const linkset = new Linkset(linksetOpts);
  const scripts = /* @__PURE__ */ Object.create(null);
  const prims = [];
  for (const primInput of input.prims) {
    const primOpts = {};
    if (primInput.key !== void 0) primOpts.key = primInput.key;
    if (primInput.name !== void 0) primOpts.name = primInput.name;
    if (primInput.description !== void 0) primOpts.description = primInput.description;
    const prim = new Prim(primOpts);
    linkset.addPrim(prim);
    prims.push(prim);
    for (const item of primInput.inventory ?? []) {
      prim.addInventory(item);
    }
    for (const sInput of primInput.scripts ?? []) {
      const { source, filename } = await readScriptSource(sInput.source);
      const { script: ast, diagnostics } = parse(source, filename);
      const errors = diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) throw new LslParseError(errors);
      const { source: _src, name: invName, ...rest } = sInput;
      const coverage = rest.coverage ?? isCoverageEnabled();
      const opts = { ...rest, filename, host: prim, source, coverage };
      const inventoryName = invName ?? rest.scriptName;
      if (inventoryName !== void 0) {
        ;
        opts.scriptName = inventoryName;
      }
      const s = new Script(ast, opts);
      if (coverage) registerScript(s);
      const finalName = inventoryName ?? s.scriptName;
      const item = prim.inventory.find((it) => it.script === s);
      if (item) item.name = finalName;
      if (finalName in scripts) {
        throw new Error(
          `loadLinkset: duplicate script name '${finalName}' across prims; give each script a unique inventory name to avoid silent overwrites`
        );
      }
      scripts[finalName] = s;
    }
  }
  return { linkset, prims, scripts };
}
export {
  ACTIVE,
  AGENT,
  AGENT_ALWAYS_RUN,
  AGENT_ATTACHMENTS,
  AGENT_AUTOMATED,
  AGENT_AUTOPILOT,
  AGENT_AWAY,
  AGENT_BUSY,
  AGENT_BY_LEGACY_NAME,
  AGENT_BY_USERNAME,
  AGENT_CROUCHING,
  AGENT_FLOATING_VIA_SCRIPTED_ATTACHMENT,
  AGENT_FLYING,
  AGENT_IN_AIR,
  AGENT_LIST_PARCEL,
  AGENT_LIST_PARCEL_OWNER,
  AGENT_LIST_REGION,
  AGENT_MOUSELOOK,
  AGENT_ON_OBJECT,
  AGENT_SCRIPTED,
  AGENT_SITTING,
  AGENT_TYPING,
  AGENT_WALKING,
  ALL_SIDES,
  ANIM_ON,
  ATTACH_ANY_HUD,
  ATTACH_AVATAR_CENTER,
  ATTACH_BACK,
  ATTACH_BELLY,
  ATTACH_CHEST,
  ATTACH_CHIN,
  ATTACH_FACE_JAW,
  ATTACH_FACE_LEAR,
  ATTACH_FACE_LEYE,
  ATTACH_FACE_REAR,
  ATTACH_FACE_REYE,
  ATTACH_FACE_TONGUE,
  ATTACH_GROIN,
  ATTACH_HEAD,
  ATTACH_HIND_LFOOT,
  ATTACH_HIND_RFOOT,
  ATTACH_HUD_BOTTOM,
  ATTACH_HUD_BOTTOM_LEFT,
  ATTACH_HUD_BOTTOM_RIGHT,
  ATTACH_HUD_CENTER_1,
  ATTACH_HUD_CENTER_2,
  ATTACH_HUD_TOP_CENTER,
  ATTACH_HUD_TOP_LEFT,
  ATTACH_HUD_TOP_RIGHT,
  ATTACH_LEAR,
  ATTACH_LEFT_PEC,
  ATTACH_LEYE,
  ATTACH_LFOOT,
  ATTACH_LHAND,
  ATTACH_LHAND_RING1,
  ATTACH_LHIP,
  ATTACH_LLARM,
  ATTACH_LLLEG,
  ATTACH_LPEC,
  ATTACH_LSHOULDER,
  ATTACH_LUARM,
  ATTACH_LULEG,
  ATTACH_LWING,
  ATTACH_MOUTH,
  ATTACH_NECK,
  ATTACH_NOSE,
  ATTACH_PELVIS,
  ATTACH_REAR,
  ATTACH_REYE,
  ATTACH_RFOOT,
  ATTACH_RHAND,
  ATTACH_RHAND_RING1,
  ATTACH_RHIP,
  ATTACH_RIGHT_PEC,
  ATTACH_RLARM,
  ATTACH_RLLEG,
  ATTACH_RPEC,
  ATTACH_RSHOULDER,
  ATTACH_RUARM,
  ATTACH_RULEG,
  ATTACH_RWING,
  ATTACH_TAIL_BASE,
  ATTACH_TAIL_TIP,
  AVOID_CHARACTERS,
  AVOID_DYNAMIC_OBSTACLES,
  AVOID_NONE,
  BEACON_MAP,
  BUILTIN_SPECS,
  CAMERA_ACTIVE,
  CAMERA_BEHINDNESS_ANGLE,
  CAMERA_BEHINDNESS_LAG,
  CAMERA_DISTANCE,
  CAMERA_FOCUS,
  CAMERA_FOCUS_LAG,
  CAMERA_FOCUS_LOCKED,
  CAMERA_FOCUS_OFFSET,
  CAMERA_FOCUS_THRESHOLD,
  CAMERA_PITCH,
  CAMERA_POSITION,
  CAMERA_POSITION_LAG,
  CAMERA_POSITION_LOCKED,
  CAMERA_POSITION_THRESHOLD,
  CHANGED_ALLOWED_DROP,
  CHANGED_COLOR,
  CHANGED_INVENTORY,
  CHANGED_LINK,
  CHANGED_MEDIA,
  CHANGED_OWNER,
  CHANGED_REGION,
  CHANGED_REGION_START,
  CHANGED_RENDER_MATERIAL,
  CHANGED_SCALE,
  CHANGED_SHAPE,
  CHANGED_TELEPORT,
  CHANGED_TEXTURE,
  CHARACTER_ACCOUNT_FOR_SKIPPED_FRAMES,
  CHARACTER_AVOIDANCE_MODE,
  CHARACTER_CMD_JUMP,
  CHARACTER_CMD_SMOOTH_STOP,
  CHARACTER_CMD_STOP,
  CHARACTER_DESIRED_SPEED,
  CHARACTER_DESIRED_TURN_SPEED,
  CHARACTER_LENGTH,
  CHARACTER_MAX_ACCEL,
  CHARACTER_MAX_DECEL,
  CHARACTER_MAX_SPEED,
  CHARACTER_MAX_TURN_RADIUS,
  CHARACTER_ORIENTATION,
  CHARACTER_RADIUS,
  CHARACTER_STAY_WITHIN_PARCEL,
  CHARACTER_TYPE,
  CHARACTER_TYPE_A,
  CHARACTER_TYPE_B,
  CHARACTER_TYPE_C,
  CHARACTER_TYPE_D,
  CHARACTER_TYPE_NONE,
  CLICK_ACTION_BUY,
  CLICK_ACTION_DISABLED,
  CLICK_ACTION_IGNORE,
  CLICK_ACTION_NONE,
  CLICK_ACTION_OPEN,
  CLICK_ACTION_OPEN_MEDIA,
  CLICK_ACTION_PAY,
  CLICK_ACTION_PLAY,
  CLICK_ACTION_SIT,
  CLICK_ACTION_TOUCH,
  CLICK_ACTION_ZOOM,
  COMBAT_CHANNEL,
  COMBAT_LOG_ID,
  CONSTANT_TABLE,
  CONTENT_TYPE_ATOM,
  CONTENT_TYPE_FORM,
  CONTENT_TYPE_HTML,
  CONTENT_TYPE_JSON,
  CONTENT_TYPE_LLSD,
  CONTENT_TYPE_RSS,
  CONTENT_TYPE_TEXT,
  CONTENT_TYPE_XHTML,
  CONTENT_TYPE_XML,
  CONTROL_BACK,
  CONTROL_DOWN,
  CONTROL_FWD,
  CONTROL_LBUTTON,
  CONTROL_LEFT,
  CONTROL_ML_LBUTTON,
  CONTROL_RIGHT,
  CONTROL_ROT_LEFT,
  CONTROL_ROT_RIGHT,
  CONTROL_UP,
  CoverageCollector,
  DAMAGEABLE,
  DAMAGE_TYPE_ACID,
  DAMAGE_TYPE_BLUDGEONING,
  DAMAGE_TYPE_COLD,
  DAMAGE_TYPE_ELECTRIC,
  DAMAGE_TYPE_EMOTIONAL,
  DAMAGE_TYPE_FIRE,
  DAMAGE_TYPE_FORCE,
  DAMAGE_TYPE_GENERIC,
  DAMAGE_TYPE_IMPACT,
  DAMAGE_TYPE_NECROTIC,
  DAMAGE_TYPE_PIERCING,
  DAMAGE_TYPE_POISON,
  DAMAGE_TYPE_PSYCHIC,
  DAMAGE_TYPE_RADIANT,
  DAMAGE_TYPE_SLASHING,
  DAMAGE_TYPE_SONIC,
  DATA_BORN,
  DATA_NAME,
  DATA_ONLINE,
  DATA_PAYINFO,
  DATA_RATING,
  DATA_SIM_POS,
  DATA_SIM_RATING,
  DATA_SIM_STATUS,
  DEBUG_CHANNEL,
  DEG_TO_RAD,
  DENSITY,
  DEREZ_DIE,
  DEREZ_MAKE_TEMP,
  ENVIRONMENT_DAYINFO,
  ENV_INVALID_AGENT,
  ENV_INVALID_RULE,
  ENV_NOT_EXPERIENCE,
  ENV_NO_ENVIRONMENT,
  ENV_NO_EXPERIENCE_LAND,
  ENV_NO_EXPERIENCE_PERMISSION,
  ENV_NO_PERMISSIONS,
  ENV_THROTTLE,
  ENV_VALIDATION_FAIL,
  EOF,
  ERR_GENERIC,
  ERR_MALFORMED_PARAMS,
  ERR_PARCEL_PERMISSIONS,
  ERR_RUNTIME_PERMISSIONS,
  ERR_THROTTLED,
  ESTATE_ACCESS_ALLOWED_AGENT_ADD,
  ESTATE_ACCESS_ALLOWED_AGENT_REMOVE,
  ESTATE_ACCESS_ALLOWED_GROUP_ADD,
  ESTATE_ACCESS_ALLOWED_GROUP_REMOVE,
  ESTATE_ACCESS_BANNED_AGENT_ADD,
  ESTATE_ACCESS_BANNED_AGENT_REMOVE,
  EVENT_SPECS,
  FALSE,
  FILTER_FLAGS,
  FILTER_FLAG_HUDS,
  FILTER_INCLUDE,
  FORCE_DIRECT_PATH,
  FRICTION,
  GAME_CONTROL_AXIS_LEFTX,
  GAME_CONTROL_AXIS_LEFTY,
  GAME_CONTROL_AXIS_RIGHTX,
  GAME_CONTROL_AXIS_RIGHTY,
  GAME_CONTROL_AXIS_TRIGGERLEFT,
  GAME_CONTROL_AXIS_TRIGGERRIGHT,
  GAME_CONTROL_BUTTON_A,
  GAME_CONTROL_BUTTON_B,
  GAME_CONTROL_BUTTON_BACK,
  GAME_CONTROL_BUTTON_DPAD_DOWN,
  GAME_CONTROL_BUTTON_DPAD_LEFT,
  GAME_CONTROL_BUTTON_DPAD_RIGHT,
  GAME_CONTROL_BUTTON_DPAD_UP,
  GAME_CONTROL_BUTTON_GUIDE,
  GAME_CONTROL_BUTTON_LEFTSHOULDER,
  GAME_CONTROL_BUTTON_LEFTSTICK,
  GAME_CONTROL_BUTTON_MISC1,
  GAME_CONTROL_BUTTON_PADDLE1,
  GAME_CONTROL_BUTTON_PADDLE2,
  GAME_CONTROL_BUTTON_PADDLE3,
  GAME_CONTROL_BUTTON_PADDLE4,
  GAME_CONTROL_BUTTON_RIGHTSHOULDER,
  GAME_CONTROL_BUTTON_RIGHTSTICK,
  GAME_CONTROL_BUTTON_START,
  GAME_CONTROL_BUTTON_TOUCHPAD,
  GAME_CONTROL_BUTTON_X,
  GAME_CONTROL_BUTTON_Y,
  GCNP_RADIUS,
  GCNP_STATIC,
  GRAVITY_MULTIPLIER,
  HORIZONTAL,
  HTTP_ACCEPT,
  HTTP_BODY_MAXLENGTH,
  HTTP_BODY_TRUNCATED,
  HTTP_CUSTOM_HEADER,
  HTTP_EXTENDED_ERROR,
  HTTP_METHOD,
  HTTP_MIMETYPE,
  HTTP_PRAGMA_NO_CACHE,
  HTTP_USER_AGENT,
  HTTP_VERBOSE_THROTTLE,
  HTTP_VERIFY_CERT,
  IMG_USE_BAKED_AUX1,
  IMG_USE_BAKED_AUX2,
  IMG_USE_BAKED_AUX3,
  IMG_USE_BAKED_EYES,
  IMG_USE_BAKED_HAIR,
  IMG_USE_BAKED_HEAD,
  IMG_USE_BAKED_LEFTARM,
  IMG_USE_BAKED_LEFTLEG,
  IMG_USE_BAKED_LOWER,
  IMG_USE_BAKED_SKIRT,
  IMG_USE_BAKED_UPPER,
  INVENTORY_ALL,
  INVENTORY_ANIMATION,
  INVENTORY_BODYPART,
  INVENTORY_CLOTHING,
  INVENTORY_GESTURE,
  INVENTORY_LANDMARK,
  INVENTORY_MATERIAL,
  INVENTORY_NONE,
  INVENTORY_NOTECARD,
  INVENTORY_OBJECT,
  INVENTORY_SCRIPT,
  INVENTORY_SETTING,
  INVENTORY_SOUND,
  INVENTORY_TEXTURE,
  InventoryType,
  JSON_APPEND,
  JSON_ARRAY,
  JSON_DELETE,
  JSON_FALSE,
  JSON_INVALID,
  JSON_NULL,
  JSON_NUMBER,
  JSON_OBJECT,
  JSON_STRING,
  JSON_TRUE,
  KFM_CMD_PAUSE,
  KFM_CMD_PLAY,
  KFM_CMD_STOP,
  KFM_COMMAND,
  KFM_DATA,
  KFM_FORWARD,
  KFM_LOOP,
  KFM_MODE,
  KFM_PING_PONG,
  KFM_REVERSE,
  KFM_ROTATION,
  KFM_TRANSLATION,
  LAND_LARGE_BRUSH,
  LAND_LEVEL,
  LAND_LOWER,
  LAND_MEDIUM_BRUSH,
  LAND_NOISE,
  LAND_RAISE,
  LAND_REVERT,
  LAND_SMALL_BRUSH,
  LAND_SMOOTH,
  LINKSETDATA_DELETE,
  LINKSETDATA_EMEMORY,
  LINKSETDATA_ENOKEY,
  LINKSETDATA_EPROTECTED,
  LINKSETDATA_MULTIDELETE,
  LINKSETDATA_NOTFOUND,
  LINKSETDATA_NOUPDATE,
  LINKSETDATA_OK,
  LINKSETDATA_RESET,
  LINKSETDATA_UPDATE,
  LINK_ALL_CHILDREN,
  LINK_ALL_OTHERS,
  LINK_ROOT,
  LINK_SET,
  LINK_THIS,
  LIST_STAT_GEOMETRIC_MEAN,
  LIST_STAT_MAX,
  LIST_STAT_MEAN,
  LIST_STAT_MEDIAN,
  LIST_STAT_MIN,
  LIST_STAT_NUM_COUNT,
  LIST_STAT_RANGE,
  LIST_STAT_STD_DEV,
  LIST_STAT_SUM,
  LIST_STAT_SUM_SQUARES,
  LOOP,
  Linkset,
  MASK_BASE,
  MASK_EVERYONE,
  MASK_GROUP,
  MASK_NEXT,
  MASK_OWNER,
  NAK,
  NULL_KEY,
  OBJECT_ACCOUNT_LEVEL,
  OBJECT_ANIMATED_COUNT,
  OBJECT_ANIMATED_SLOTS_AVAILABLE,
  OBJECT_ATTACHED_POINT,
  OBJECT_ATTACHED_SLOTS_AVAILABLE,
  OBJECT_BODY_SHAPE_TYPE,
  OBJECT_CHARACTER_TIME,
  OBJECT_CLICK_ACTION,
  OBJECT_CREATION_TIME,
  OBJECT_CREATOR,
  OBJECT_DAMAGE,
  OBJECT_DAMAGE_TYPE,
  OBJECT_DESC,
  OBJECT_GROUP,
  OBJECT_GROUP_TAG,
  OBJECT_HEALTH,
  OBJECT_HOVER_HEIGHT,
  OBJECT_LAST_OWNER_ID,
  OBJECT_LINK_NUMBER,
  OBJECT_MASS,
  OBJECT_MATERIAL,
  OBJECT_NAME,
  OBJECT_OMEGA,
  OBJECT_OWNER,
  OBJECT_PATHFINDING_TYPE,
  OBJECT_PHANTOM,
  OBJECT_PHYSICS,
  OBJECT_PHYSICS_COST,
  OBJECT_POS,
  OBJECT_PRIM_COUNT,
  OBJECT_PRIM_EQUIVALENCE,
  OBJECT_RENDER_WEIGHT,
  OBJECT_RETURN_PARCEL,
  OBJECT_RETURN_PARCEL_OWNER,
  OBJECT_RETURN_REGION,
  OBJECT_REZZER_KEY,
  OBJECT_REZ_TIME,
  OBJECT_ROOT,
  OBJECT_ROT,
  OBJECT_RUNNING_SCRIPT_COUNT,
  OBJECT_SCALE,
  OBJECT_SCRIPT_MEMORY,
  OBJECT_SCRIPT_TIME,
  OBJECT_SELECT_COUNT,
  OBJECT_SERVER_COST,
  OBJECT_SIT_COUNT,
  OBJECT_STREAMING_COST,
  OBJECT_TEMP_ATTACHED,
  OBJECT_TEMP_ON_REZ,
  OBJECT_TEXT,
  OBJECT_TEXT_ALPHA,
  OBJECT_TEXT_COLOR,
  OBJECT_TOTAL_INVENTORY_COUNT,
  OBJECT_TOTAL_SCRIPT_COUNT,
  OBJECT_UNKNOWN_DETAIL,
  OBJECT_VELOCITY,
  OPT_AVATAR,
  OPT_CHARACTER,
  OPT_EXCLUSION_VOLUME,
  OPT_LEGACY_LINKSET,
  OPT_MATERIAL_VOLUME,
  OPT_OTHER,
  OPT_STATIC_OBSTACLE,
  OPT_WALKABLE,
  PARCEL_COUNT_GROUP,
  PARCEL_COUNT_OTHER,
  PARCEL_COUNT_OWNER,
  PARCEL_COUNT_SELECTED,
  PARCEL_COUNT_TEMP,
  PARCEL_COUNT_TOTAL,
  PARCEL_DETAILS_AREA,
  PARCEL_DETAILS_DESC,
  PARCEL_DETAILS_FLAGS,
  PARCEL_DETAILS_GROUP,
  PARCEL_DETAILS_ID,
  PARCEL_DETAILS_LANDING_LOOKAT,
  PARCEL_DETAILS_LANDING_POINT,
  PARCEL_DETAILS_NAME,
  PARCEL_DETAILS_OWNER,
  PARCEL_DETAILS_PRIM_CAPACITY,
  PARCEL_DETAILS_PRIM_USED,
  PARCEL_DETAILS_SCRIPT_DANGER,
  PARCEL_DETAILS_SEE_AVATARS,
  PARCEL_DETAILS_TP_ROUTING,
  PARCEL_FLAG_ALLOW_ALL_OBJECT_ENTRY,
  PARCEL_FLAG_ALLOW_CREATE_GROUP_OBJECTS,
  PARCEL_FLAG_ALLOW_CREATE_OBJECTS,
  PARCEL_FLAG_ALLOW_DAMAGE,
  PARCEL_FLAG_ALLOW_FLY,
  PARCEL_FLAG_ALLOW_GROUP_OBJECT_ENTRY,
  PARCEL_FLAG_ALLOW_GROUP_SCRIPTS,
  PARCEL_FLAG_ALLOW_LANDMARK,
  PARCEL_FLAG_ALLOW_SCRIPTS,
  PARCEL_FLAG_ALLOW_TERRAFORM,
  PARCEL_FLAG_LOCAL_SOUND_ONLY,
  PARCEL_FLAG_RESTRICT_PUSHOBJECT,
  PARCEL_FLAG_USE_ACCESS_GROUP,
  PARCEL_FLAG_USE_ACCESS_LIST,
  PARCEL_FLAG_USE_BAN_LIST,
  PARCEL_FLAG_USE_LAND_PASS_LIST,
  PARCEL_MEDIA_COMMAND_AGENT,
  PARCEL_MEDIA_COMMAND_AUTO_ALIGN,
  PARCEL_MEDIA_COMMAND_DESC,
  PARCEL_MEDIA_COMMAND_LOOP,
  PARCEL_MEDIA_COMMAND_LOOP_SET,
  PARCEL_MEDIA_COMMAND_PAUSE,
  PARCEL_MEDIA_COMMAND_PLAY,
  PARCEL_MEDIA_COMMAND_SIZE,
  PARCEL_MEDIA_COMMAND_STOP,
  PARCEL_MEDIA_COMMAND_TEXTURE,
  PARCEL_MEDIA_COMMAND_TIME,
  PARCEL_MEDIA_COMMAND_TYPE,
  PARCEL_MEDIA_COMMAND_UNLOAD,
  PARCEL_MEDIA_COMMAND_URL,
  PASSIVE,
  PASS_ALWAYS,
  PASS_IF_NOT_HANDLED,
  PASS_NEVER,
  PATROL_PAUSE_AT_WAYPOINTS,
  PAYMENT_INFO_ON_FILE,
  PAYMENT_INFO_USED,
  PAY_DEFAULT,
  PAY_HIDE,
  PERMISSION_ATTACH,
  PERMISSION_CHANGE_JOINTS,
  PERMISSION_CHANGE_LINKS,
  PERMISSION_CHANGE_PERMISSIONS,
  PERMISSION_CONTROL_CAMERA,
  PERMISSION_DEBIT,
  PERMISSION_OVERRIDE_ANIMATIONS,
  PERMISSION_RELEASE_OWNERSHIP,
  PERMISSION_REMAP_CONTROLS,
  PERMISSION_RETURN_OBJECTS,
  PERMISSION_SILENT_ESTATE_MANAGEMENT,
  PERMISSION_TAKE_CONTROLS,
  PERMISSION_TELEPORT,
  PERMISSION_TRACK_CAMERA,
  PERMISSION_TRIGGER_ANIMATION,
  PERM_ALL,
  PERM_COPY,
  PERM_MODIFY,
  PERM_MOVE,
  PERM_TRANSFER,
  PI,
  PING_PONG,
  PI_BY_TWO,
  PRIM_ALLOW_UNSIT,
  PRIM_ALPHA_MODE,
  PRIM_ALPHA_MODE_BLEND,
  PRIM_ALPHA_MODE_EMISSIVE,
  PRIM_ALPHA_MODE_MASK,
  PRIM_ALPHA_MODE_NONE,
  PRIM_BUMP_BARK,
  PRIM_BUMP_BLOBS,
  PRIM_BUMP_BRICKS,
  PRIM_BUMP_BRIGHT,
  PRIM_BUMP_CHECKER,
  PRIM_BUMP_CONCRETE,
  PRIM_BUMP_DARK,
  PRIM_BUMP_DISKS,
  PRIM_BUMP_GRAVEL,
  PRIM_BUMP_LARGETILE,
  PRIM_BUMP_NONE,
  PRIM_BUMP_SHINY,
  PRIM_BUMP_SIDING,
  PRIM_BUMP_STONE,
  PRIM_BUMP_STUCCO,
  PRIM_BUMP_SUCTION,
  PRIM_BUMP_TILE,
  PRIM_BUMP_WEAVE,
  PRIM_BUMP_WOOD,
  PRIM_CAST_SHADOWS,
  PRIM_CLICK_ACTION,
  PRIM_COLOR,
  PRIM_DAMAGE,
  PRIM_DESC,
  PRIM_FLEXIBLE,
  PRIM_FULLBRIGHT,
  PRIM_GLOW,
  PRIM_GLTF_ALPHA_MODE_BLEND,
  PRIM_GLTF_ALPHA_MODE_MASK,
  PRIM_GLTF_ALPHA_MODE_OPAQUE,
  PRIM_GLTF_BASE_COLOR,
  PRIM_GLTF_EMISSIVE,
  PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL,
  PRIM_HEALTH,
  PRIM_HOLE_CIRCLE,
  PRIM_HOLE_DEFAULT,
  PRIM_HOLE_SQUARE,
  PRIM_HOLE_TRIANGLE,
  PRIM_LINK_TARGET,
  PRIM_MATERIAL,
  PRIM_MATERIAL_FLESH,
  PRIM_MATERIAL_GLASS,
  PRIM_MATERIAL_LIGHT,
  PRIM_MATERIAL_METAL,
  PRIM_MATERIAL_PLASTIC,
  PRIM_MATERIAL_RUBBER,
  PRIM_MATERIAL_STONE,
  PRIM_MATERIAL_WOOD,
  PRIM_MEDIA_ALT_IMAGE_ENABLE,
  PRIM_MEDIA_AUTO_LOOP,
  PRIM_MEDIA_AUTO_PLAY,
  PRIM_MEDIA_AUTO_SCALE,
  PRIM_MEDIA_AUTO_ZOOM,
  PRIM_MEDIA_CONTROLS,
  PRIM_MEDIA_CONTROLS_MINI,
  PRIM_MEDIA_CONTROLS_STANDARD,
  PRIM_MEDIA_CURRENT_URL,
  PRIM_MEDIA_FIRST_CLICK_INTERACT,
  PRIM_MEDIA_HEIGHT_PIXELS,
  PRIM_MEDIA_HOME_URL,
  PRIM_MEDIA_MAX_HEIGHT_PIXELS,
  PRIM_MEDIA_MAX_URL_LENGTH,
  PRIM_MEDIA_MAX_WHITELIST_COUNT,
  PRIM_MEDIA_MAX_WHITELIST_SIZE,
  PRIM_MEDIA_MAX_WIDTH_PIXELS,
  PRIM_MEDIA_PARAM_MAX,
  PRIM_MEDIA_PERMS_CONTROL,
  PRIM_MEDIA_PERMS_INTERACT,
  PRIM_MEDIA_PERM_ANYONE,
  PRIM_MEDIA_PERM_GROUP,
  PRIM_MEDIA_PERM_NONE,
  PRIM_MEDIA_PERM_OWNER,
  PRIM_MEDIA_WHITELIST,
  PRIM_MEDIA_WHITELIST_ENABLE,
  PRIM_MEDIA_WIDTH_PIXELS,
  PRIM_NAME,
  PRIM_NORMAL,
  PRIM_OMEGA,
  PRIM_PHANTOM,
  PRIM_PHYSICS,
  PRIM_PHYSICS_SHAPE_CONVEX,
  PRIM_PHYSICS_SHAPE_NONE,
  PRIM_PHYSICS_SHAPE_PRIM,
  PRIM_PHYSICS_SHAPE_TYPE,
  PRIM_POINT_LIGHT,
  PRIM_POSITION,
  PRIM_POS_LOCAL,
  PRIM_PROJECTOR,
  PRIM_REFLECTION_PROBE,
  PRIM_REFLECTION_PROBE_BOX,
  PRIM_REFLECTION_PROBE_DYNAMIC,
  PRIM_REFLECTION_PROBE_MIRROR,
  PRIM_RENDER_MATERIAL,
  PRIM_ROTATION,
  PRIM_ROT_LOCAL,
  PRIM_SCRIPTED_SIT_ONLY,
  PRIM_SCULPT_FLAG_ANIMESH,
  PRIM_SCULPT_FLAG_INVERT,
  PRIM_SCULPT_FLAG_MIRROR,
  PRIM_SCULPT_TYPE_CYLINDER,
  PRIM_SCULPT_TYPE_MASK,
  PRIM_SCULPT_TYPE_MESH,
  PRIM_SCULPT_TYPE_PLANE,
  PRIM_SCULPT_TYPE_SPHERE,
  PRIM_SCULPT_TYPE_TORUS,
  PRIM_SHINY_HIGH,
  PRIM_SHINY_LOW,
  PRIM_SHINY_MEDIUM,
  PRIM_SHINY_NONE,
  PRIM_SIT_FLAGS,
  PRIM_SIT_TARGET,
  PRIM_SIZE,
  PRIM_SLICE,
  PRIM_SPECULAR,
  PRIM_TEMP_ON_REZ,
  PRIM_TEXGEN,
  PRIM_TEXGEN_DEFAULT,
  PRIM_TEXGEN_PLANAR,
  PRIM_TEXT,
  PRIM_TEXTURE,
  PRIM_TYPE,
  PRIM_TYPE_BOX,
  PRIM_TYPE_CYLINDER,
  PRIM_TYPE_PRISM,
  PRIM_TYPE_RING,
  PRIM_TYPE_SCULPT,
  PRIM_TYPE_SPHERE,
  PRIM_TYPE_TORUS,
  PRIM_TYPE_TUBE,
  PROFILE_NONE,
  PROFILE_SCRIPT_MEMORY,
  PSYS_PART_BF_DEST_COLOR,
  PSYS_PART_BF_ONE,
  PSYS_PART_BF_ONE_MINUS_DEST_COLOR,
  PSYS_PART_BF_ONE_MINUS_SOURCE_ALPHA,
  PSYS_PART_BF_ONE_MINUS_SOURCE_COLOR,
  PSYS_PART_BF_SOURCE_ALPHA,
  PSYS_PART_BF_SOURCE_COLOR,
  PSYS_PART_BF_ZERO,
  PSYS_PART_BLEND_FUNC_DEST,
  PSYS_PART_BLEND_FUNC_SOURCE,
  PSYS_PART_BOUNCE_MASK,
  PSYS_PART_EMISSIVE_MASK,
  PSYS_PART_END_ALPHA,
  PSYS_PART_END_COLOR,
  PSYS_PART_END_GLOW,
  PSYS_PART_END_SCALE,
  PSYS_PART_FLAGS,
  PSYS_PART_FOLLOW_SRC_MASK,
  PSYS_PART_FOLLOW_VELOCITY_MASK,
  PSYS_PART_INTERP_COLOR_MASK,
  PSYS_PART_INTERP_SCALE_MASK,
  PSYS_PART_MAX_AGE,
  PSYS_PART_RIBBON_MASK,
  PSYS_PART_START_ALPHA,
  PSYS_PART_START_COLOR,
  PSYS_PART_START_GLOW,
  PSYS_PART_START_SCALE,
  PSYS_PART_TARGET_LINEAR_MASK,
  PSYS_PART_TARGET_POS_MASK,
  PSYS_PART_WIND_MASK,
  PSYS_SRC_ACCEL,
  PSYS_SRC_ANGLE_BEGIN,
  PSYS_SRC_ANGLE_END,
  PSYS_SRC_BURST_PART_COUNT,
  PSYS_SRC_BURST_RADIUS,
  PSYS_SRC_BURST_RATE,
  PSYS_SRC_BURST_SPEED_MAX,
  PSYS_SRC_BURST_SPEED_MIN,
  PSYS_SRC_INNERANGLE,
  PSYS_SRC_MAX_AGE,
  PSYS_SRC_OBJ_REL_MASK,
  PSYS_SRC_OMEGA,
  PSYS_SRC_OUTERANGLE,
  PSYS_SRC_PATTERN,
  PSYS_SRC_PATTERN_ANGLE,
  PSYS_SRC_PATTERN_ANGLE_CONE,
  PSYS_SRC_PATTERN_ANGLE_CONE_EMPTY,
  PSYS_SRC_PATTERN_DROP,
  PSYS_SRC_PATTERN_EXPLODE,
  PSYS_SRC_TARGET_KEY,
  PSYS_SRC_TEXTURE,
  PUBLIC_CHANNEL,
  PURSUIT_FUZZ_FACTOR,
  PURSUIT_GOAL_TOLERANCE,
  PURSUIT_INTERCEPT,
  PURSUIT_OFFSET,
  PU_EVADE_HIDDEN,
  PU_EVADE_SPOTTED,
  PU_FAILURE_DYNAMIC_PATHFINDING_DISABLED,
  PU_FAILURE_INVALID_GOAL,
  PU_FAILURE_INVALID_START,
  PU_FAILURE_NO_NAVMESH,
  PU_FAILURE_NO_VALID_DESTINATION,
  PU_FAILURE_OTHER,
  PU_FAILURE_PARCEL_UNREACHABLE,
  PU_FAILURE_TARGET_GONE,
  PU_FAILURE_UNREACHABLE,
  PU_GOAL_REACHED,
  PU_SLOWDOWN_DISTANCE_REACHED,
  Prim,
  RAD_TO_DEG,
  RCERR_CAST_TIME_EXCEEDED,
  RCERR_SIM_PERF_LOW,
  RCERR_UNKNOWN,
  RC_DATA_FLAGS,
  RC_DETECT_PHANTOM,
  RC_GET_LINK_NUM,
  RC_GET_NORMAL,
  RC_GET_ROOT_KEY,
  RC_MAX_HITS,
  RC_REJECT_AGENTS,
  RC_REJECT_LAND,
  RC_REJECT_NONPHYSICAL,
  RC_REJECT_PHYSICAL,
  RC_REJECT_TYPES,
  REGION_FLAG_ALLOW_DAMAGE,
  REGION_FLAG_ALLOW_DIRECT_TELEPORT,
  REGION_FLAG_BLOCK_FLY,
  REGION_FLAG_BLOCK_FLYOVER,
  REGION_FLAG_BLOCK_TERRAFORM,
  REGION_FLAG_DISABLE_COLLISIONS,
  REGION_FLAG_DISABLE_PHYSICS,
  REGION_FLAG_FIXED_SUN,
  REGION_FLAG_RESTRICT_PUSHOBJECT,
  REGION_FLAG_SANDBOX,
  REMOTE_DATA_CHANNEL,
  REMOTE_DATA_REPLY,
  REMOTE_DATA_REQUEST,
  REQUIRE_LINE_OF_SIGHT,
  RESTITUTION,
  REVERSE,
  REZ_ACCEL,
  REZ_DAMAGE,
  REZ_DAMAGE_TYPE,
  REZ_FLAGS,
  REZ_FLAG_BLOCK_GRAB_OBJECT,
  REZ_FLAG_DIE_ON_COLLIDE,
  REZ_FLAG_DIE_ON_NOENTRY,
  REZ_FLAG_NO_COLLIDE_FAMILY,
  REZ_FLAG_NO_COLLIDE_OWNER,
  REZ_FLAG_PHANTOM,
  REZ_FLAG_PHYSICAL,
  REZ_FLAG_TEMP,
  REZ_LOCK_AXES,
  REZ_OMEGA,
  REZ_PARAM,
  REZ_PARAM_STRING,
  REZ_POS,
  REZ_ROT,
  REZ_SOUND,
  REZ_SOUND_COLLIDE,
  REZ_VEL,
  ROTATE,
  SCALE,
  SCRIPTED,
  SIM_STAT_ACTIVE_SCRIPT_COUNT,
  SIM_STAT_AGENT_COUNT,
  SIM_STAT_AGENT_MS,
  SIM_STAT_AGENT_UPDATES,
  SIM_STAT_AI_MS,
  SIM_STAT_ASSET_DOWNLOADS,
  SIM_STAT_ASSET_UPLOADS,
  SIM_STAT_CHILD_AGENT_COUNT,
  SIM_STAT_FRAME_MS,
  SIM_STAT_IMAGE_MS,
  SIM_STAT_IO_PUMP_MS,
  SIM_STAT_NET_MS,
  SIM_STAT_OTHER_MS,
  SIM_STAT_PACKETS_IN,
  SIM_STAT_PACKETS_OUT,
  SIM_STAT_PCT_CHARS_STEPPED,
  SIM_STAT_PHYSICS_FPS,
  SIM_STAT_PHYSICS_MS,
  SIM_STAT_PHYSICS_OTHER_MS,
  SIM_STAT_PHYSICS_SHAPE_MS,
  SIM_STAT_PHYSICS_STEP_MS,
  SIM_STAT_SCRIPT_EPS,
  SIM_STAT_SCRIPT_MS,
  SIM_STAT_SCRIPT_RUN_PCT,
  SIM_STAT_SLEEP_MS,
  SIM_STAT_SPARE_MS,
  SIM_STAT_UNACKED_BYTES,
  SIT_FLAG_ALLOW_UNSIT,
  SIT_FLAG_NO_COLLIDE,
  SIT_FLAG_NO_DAMAGE,
  SIT_FLAG_SCRIPTED_ONLY,
  SIT_FLAG_SIT_TARGET,
  SIT_INVALID_AGENT,
  SIT_INVALID_LINK,
  SIT_INVALID_OBJECT,
  SIT_NOT_EXPERIENCE,
  SIT_NO_ACCESS,
  SIT_NO_EXPERIENCE_PERMISSION,
  SIT_NO_SIT_TARGET,
  SKY_ABSORPTION_CONFIG,
  SKY_AMBIENT,
  SKY_BLUE,
  SKY_CLOUDS,
  SKY_CLOUD_TEXTURE,
  SKY_DENSITY_PROFILE_COUNTS,
  SKY_DOME,
  SKY_GAMMA,
  SKY_GLOW,
  SKY_HAZE,
  SKY_LIGHT,
  SKY_MIE_CONFIG,
  SKY_MOON,
  SKY_MOON_TEXTURE,
  SKY_PLANET,
  SKY_RAYLEIGH_CONFIG,
  SKY_REFLECTION_PROBE_AMBIANCE,
  SKY_REFRACTION,
  SKY_STAR_BRIGHTNESS,
  SKY_SUN,
  SKY_SUN_TEXTURE,
  SKY_TEXTURE_DEFAULTS,
  SKY_TRACKS,
  SMOOTH,
  SOUND_LOOP,
  SOUND_PLAY,
  SOUND_SYNC,
  SOUND_TRIGGER,
  SQRT2,
  STATUS_BLOCK_GRAB,
  STATUS_BLOCK_GRAB_OBJECT,
  STATUS_BOUNDS_ERROR,
  STATUS_CAST_SHADOWS,
  STATUS_DIE_AT_EDGE,
  STATUS_DIE_AT_NO_ENTRY,
  STATUS_INTERNAL_ERROR,
  STATUS_MALFORMED_PARAMS,
  STATUS_NOT_FOUND,
  STATUS_NOT_SUPPORTED,
  STATUS_OK,
  STATUS_PHANTOM,
  STATUS_PHYSICS,
  STATUS_RETURN_AT_EDGE,
  STATUS_ROTATE_X,
  STATUS_ROTATE_Y,
  STATUS_ROTATE_Z,
  STATUS_SANDBOX,
  STATUS_TYPE_MISMATCH,
  STATUS_WHITELIST_FAILED,
  STRING_TRIM,
  STRING_TRIM_HEAD,
  STRING_TRIM_TAIL,
  Script,
  TARGETED_EMAIL_OBJECT_OWNER,
  TARGETED_EMAIL_ROOT_CREATOR,
  TEXTURE_BLANK,
  TEXTURE_DEFAULT,
  TEXTURE_MEDIA,
  TEXTURE_PLYWOOD,
  TEXTURE_TRANSPARENT,
  TOUCH_INVALID_FACE,
  TOUCH_INVALID_TEXCOORD,
  TOUCH_INVALID_VECTOR,
  TP_ROUTING_BLOCKED,
  TP_ROUTING_FREE,
  TP_ROUTING_LANDINGP,
  TRANSFER_BAD_OPTS,
  TRANSFER_BAD_ROOT,
  TRANSFER_DEST,
  TRANSFER_FLAGS,
  TRANSFER_FLAG_COPY,
  TRANSFER_FLAG_RESERVED,
  TRANSFER_FLAG_TAKE,
  TRANSFER_NO_ATTACHMENT,
  TRANSFER_NO_ITEMS,
  TRANSFER_NO_PERMS,
  TRANSFER_NO_TARGET,
  TRANSFER_OK,
  TRANSFER_THROTTLE,
  TRAVERSAL_TYPE,
  TRAVERSAL_TYPE_FAST,
  TRAVERSAL_TYPE_NONE,
  TRAVERSAL_TYPE_SLOW,
  TRUE,
  TWO_PI,
  TYPE_FLOAT,
  TYPE_INTEGER,
  TYPE_INVALID,
  TYPE_KEY,
  TYPE_ROTATION,
  TYPE_STRING,
  TYPE_VECTOR,
  URL_REQUEST_DENIED,
  URL_REQUEST_GRANTED,
  VEHICLE_ANGULAR_DEFLECTION_EFFICIENCY,
  VEHICLE_ANGULAR_DEFLECTION_TIMESCALE,
  VEHICLE_ANGULAR_FRICTION_TIMESCALE,
  VEHICLE_ANGULAR_MOTOR_DECAY_TIMESCALE,
  VEHICLE_ANGULAR_MOTOR_DIRECTION,
  VEHICLE_ANGULAR_MOTOR_TIMESCALE,
  VEHICLE_BANKING_EFFICIENCY,
  VEHICLE_BANKING_MIX,
  VEHICLE_BANKING_TIMESCALE,
  VEHICLE_BUOYANCY,
  VEHICLE_FLAG_BLOCK_INTERFERENCE,
  VEHICLE_FLAG_CAMERA_DECOUPLED,
  VEHICLE_FLAG_HOVER_GLOBAL_HEIGHT,
  VEHICLE_FLAG_HOVER_TERRAIN_ONLY,
  VEHICLE_FLAG_HOVER_UP_ONLY,
  VEHICLE_FLAG_HOVER_WATER_ONLY,
  VEHICLE_FLAG_LIMIT_MOTOR_UP,
  VEHICLE_FLAG_LIMIT_ROLL_ONLY,
  VEHICLE_FLAG_MOUSELOOK_BANK,
  VEHICLE_FLAG_MOUSELOOK_STEER,
  VEHICLE_FLAG_NO_DEFLECTION_UP,
  VEHICLE_FLAG_NO_FLY_UP,
  VEHICLE_HOVER_EFFICIENCY,
  VEHICLE_HOVER_HEIGHT,
  VEHICLE_HOVER_TIMESCALE,
  VEHICLE_LINEAR_DEFLECTION_EFFICIENCY,
  VEHICLE_LINEAR_DEFLECTION_TIMESCALE,
  VEHICLE_LINEAR_FRICTION_TIMESCALE,
  VEHICLE_LINEAR_MOTOR_DECAY_TIMESCALE,
  VEHICLE_LINEAR_MOTOR_DIRECTION,
  VEHICLE_LINEAR_MOTOR_OFFSET,
  VEHICLE_LINEAR_MOTOR_TIMESCALE,
  VEHICLE_REFERENCE_FRAME,
  VEHICLE_TYPE_AIRPLANE,
  VEHICLE_TYPE_BALLOON,
  VEHICLE_TYPE_BOAT,
  VEHICLE_TYPE_CAR,
  VEHICLE_TYPE_NONE,
  VEHICLE_TYPE_SLED,
  VEHICLE_VERTICAL_ATTRACTION_EFFICIENCY,
  VEHICLE_VERTICAL_ATTRACTION_TIMESCALE,
  VERTICAL,
  WANDER_PAUSE_AT_WAYPOINTS,
  WATER_BLUR_MULTIPLIER,
  WATER_FOG,
  WATER_FRESNEL,
  WATER_NORMAL_SCALE,
  WATER_NORMAL_TEXTURE,
  WATER_REFRACTION,
  WATER_TEXTURE_DEFAULTS,
  WATER_WAVE_DIRECTION,
  XP_ERROR_EXPERIENCES_DISABLED,
  XP_ERROR_EXPERIENCE_DISABLED,
  XP_ERROR_EXPERIENCE_SUSPENDED,
  XP_ERROR_INVALID_EXPERIENCE,
  XP_ERROR_INVALID_PARAMETERS,
  XP_ERROR_KEY_NOT_FOUND,
  XP_ERROR_MATURITY_EXCEEDED,
  XP_ERROR_NONE,
  XP_ERROR_NOT_FOUND,
  XP_ERROR_NOT_PERMITTED,
  XP_ERROR_NOT_PERMITTED_LAND,
  XP_ERROR_NO_EXPERIENCE,
  XP_ERROR_QUOTA_EXCEEDED,
  XP_ERROR_REQUEST_PERM_TIMEOUT,
  XP_ERROR_RETRY_UPDATE,
  XP_ERROR_STORAGE_EXCEPTION,
  XP_ERROR_STORE_DISABLED,
  XP_ERROR_THROTTLED,
  XP_ERROR_UNKNOWN_ERROR,
  ZERO_ROTATION,
  ZERO_VECTOR,
  buildCoveragePlan,
  defaultValueFor,
  loadLinkset,
  loadScript,
  makeInventoryItem,
  mergeReports
};
//# sourceMappingURL=index.js.map