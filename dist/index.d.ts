declare module 'vitest' {
    interface Assertion<T = any> {
        toHaveSaid(channel: number, text: string): T;
        toBeInState(name: string): T;
        toHaveCalledFunction(name: string, ...args: unknown[]): T;
        toHaveSentHTTP(expected: {
            url?: string;
            method?: string;
            body?: string;
        }): T;
        toHaveListened(channel: number, filter?: {
            name?: string;
            key?: string;
            message?: string;
        }): T;
    }
    interface AsymmetricMatchersContaining {
        toHaveSaid(channel: number, text: string): unknown;
        toBeInState(name: string): unknown;
        toHaveCalledFunction(name: string, ...args: unknown[]): unknown;
        toHaveSentHTTP(expected: {
            url?: string;
            method?: string;
            body?: string;
        }): unknown;
        toHaveListened(channel: number, filter?: {
            name?: string;
            key?: string;
            message?: string;
        }): unknown;
    }
}

interface SourceLocation {
    /** 1-based line number. */
    readonly line: number;
    /** 1-based column number. */
    readonly col: number;
    /** 0-based byte offset into the source. */
    readonly offset: number;
}

interface Node {
    readonly loc: SourceLocation;
}
interface Script$1 extends Node {
    readonly kind: 'Script';
    readonly globals: ReadonlyArray<GlobalVariable>;
    readonly functions: ReadonlyArray<FunctionDeclaration>;
    readonly states: ReadonlyArray<State>;
}
interface FunctionDeclaration extends Node {
    readonly kind: 'FunctionDeclaration';
    /** Declared return type, or null for void-returning functions. */
    readonly returnType: TypeName | null;
    readonly name: string;
    readonly params: ReadonlyArray<Param>;
    readonly body: BlockStatement;
}
interface GlobalVariable extends Node {
    readonly kind: 'GlobalVariable';
    readonly typeName: TypeName;
    readonly name: string;
    readonly init: Expression | null;
}
interface State extends Node {
    readonly kind: 'State';
    /** "default" for the default state, otherwise the user-defined name. */
    readonly name: string;
    readonly handlers: ReadonlyArray<EventHandler>;
}
interface EventHandler extends Node {
    readonly kind: 'EventHandler';
    readonly name: string;
    readonly params: ReadonlyArray<Param>;
    readonly body: BlockStatement;
}
interface Param extends Node {
    readonly kind: 'Param';
    readonly typeName: TypeName;
    readonly name: string;
}
type TypeName = 'integer' | 'float' | 'string' | 'key' | 'vector' | 'rotation' | 'list';
type Statement = BlockStatement | VariableDeclaration | ExpressionStatement | IfStatement | WhileStatement | DoWhileStatement | ForStatement | ReturnStatement | StateChangeStatement | JumpStatement | LabelStatement;
interface BlockStatement extends Node {
    readonly kind: 'BlockStatement';
    readonly body: ReadonlyArray<Statement>;
}
interface VariableDeclaration extends Node {
    readonly kind: 'VariableDeclaration';
    readonly typeName: TypeName;
    readonly name: string;
    readonly init: Expression | null;
}
interface ExpressionStatement extends Node {
    readonly kind: 'ExpressionStatement';
    readonly expression: Expression;
}
interface IfStatement extends Node {
    readonly kind: 'IfStatement';
    readonly test: Expression;
    readonly consequent: Statement;
    readonly alternate: Statement | null;
}
interface WhileStatement extends Node {
    readonly kind: 'WhileStatement';
    readonly test: Expression;
    readonly body: Statement;
}
interface DoWhileStatement extends Node {
    readonly kind: 'DoWhileStatement';
    readonly body: Statement;
    readonly test: Expression;
}
interface ForStatement extends Node {
    readonly kind: 'ForStatement';
    readonly init: ReadonlyArray<Expression>;
    readonly test: Expression | null;
    readonly update: ReadonlyArray<Expression>;
    readonly body: Statement;
}
interface ReturnStatement extends Node {
    readonly kind: 'ReturnStatement';
    readonly argument: Expression | null;
}
interface StateChangeStatement extends Node {
    readonly kind: 'StateChangeStatement';
    /** Target state name (`default` or any user state). */
    readonly target: string;
}
interface JumpStatement extends Node {
    readonly kind: 'JumpStatement';
    readonly label: string;
}
interface LabelStatement extends Node {
    readonly kind: 'LabelStatement';
    readonly name: string;
}
type Expression = IntegerLiteral | FloatLiteral | StringLiteral | VectorLiteral | RotationLiteral | ListLiteral | Identifier | CallExpression | UnaryExpression | BinaryExpression | AssignmentExpression | CastExpression | MemberExpression | UpdateExpression;
interface IntegerLiteral extends Node {
    readonly kind: 'IntegerLiteral';
    readonly value: number;
}
interface FloatLiteral extends Node {
    readonly kind: 'FloatLiteral';
    readonly value: number;
}
interface StringLiteral extends Node {
    readonly kind: 'StringLiteral';
    readonly value: string;
}
interface VectorLiteral extends Node {
    readonly kind: 'VectorLiteral';
    readonly x: Expression;
    readonly y: Expression;
    readonly z: Expression;
}
interface RotationLiteral extends Node {
    readonly kind: 'RotationLiteral';
    readonly x: Expression;
    readonly y: Expression;
    readonly z: Expression;
    readonly s: Expression;
}
interface ListLiteral extends Node {
    readonly kind: 'ListLiteral';
    readonly elements: ReadonlyArray<Expression>;
}
interface Identifier extends Node {
    readonly kind: 'Identifier';
    readonly name: string;
}
interface CallExpression extends Node {
    readonly kind: 'CallExpression';
    readonly callee: string;
    readonly args: ReadonlyArray<Expression>;
}
type UnaryOp = '+' | '-' | '!' | '~';
interface UnaryExpression extends Node {
    readonly kind: 'UnaryExpression';
    readonly operator: UnaryOp;
    readonly argument: Expression;
}
type BinaryOp = '*' | '/' | '%' | '+' | '-' | '<<' | '>>' | '<' | '>' | '<=' | '>=' | '==' | '!=' | '&' | '^' | '|' | '&&' | '||';
interface BinaryExpression extends Node {
    readonly kind: 'BinaryExpression';
    readonly operator: BinaryOp;
    readonly left: Expression;
    readonly right: Expression;
}
type AssignmentOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=';
interface AssignmentExpression extends Node {
    readonly kind: 'AssignmentExpression';
    readonly operator: AssignmentOp;
    /** Target — must be an Identifier or MemberExpression in valid LSL. */
    readonly target: Expression;
    readonly value: Expression;
}
interface CastExpression extends Node {
    readonly kind: 'CastExpression';
    readonly targetType: TypeName;
    readonly argument: Expression;
}
interface MemberExpression extends Node {
    readonly kind: 'MemberExpression';
    readonly object: Expression;
    /** Restricted to "x" | "y" | "z" | "s" in LSL (vector/rotation accessors). */
    readonly property: string;
}
type UpdateOp = '++' | '--';
interface UpdateExpression extends Node {
    readonly kind: 'UpdateExpression';
    readonly operator: UpdateOp;
    readonly prefix: boolean;
    readonly argument: Expression;
}

interface LinksetDataEntry {
    value: string;
    /** Empty string = unprotected. */
    password: string;
}

/**
 * LSL value types as represented at runtime.
 *
 * LSL has 7 value types: integer, float, string, key, vector, rotation, list.
 * Internally we use raw JS values (number / string / Vector / Rotation / array)
 * and carry the LSL type tag alongside in `EvalResult`. Tagging the type
 * separately keeps the public boundary (call log, ll* builtin args) simple
 * while still letting arithmetic and coercion know whether a number is an
 * integer or a float.
 */
type LslType = 'integer' | 'float' | 'string' | 'key' | 'vector' | 'rotation' | 'list' | 'void';
interface Vector {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}
interface Rotation {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly s: number;
}
type LslValue = number | string | Vector | Rotation | ReadonlyArray<LslValue>;
declare const ZERO_VECTOR: Vector;
declare const ZERO_ROTATION: Rotation;
declare const NULL_KEY = "00000000-0000-0000-0000-000000000000";
declare function defaultValueFor(type: LslType): LslValue | undefined;

/**
 * One entry in the per-handler "detected" context — the data exposed to
 * llDetected* family functions while a touch / sensor / collision handler
 * is running. Tests provide this via the event payload (e.g.
 * `s.fire('touch_start', { num_detected: 1, detected: [{...}] })`).
 */
interface DetectedEntry {
    readonly key: string;
    readonly name: string;
    readonly owner?: string;
    readonly group?: string;
    readonly pos?: Vector;
    readonly rot?: Rotation;
    readonly vel?: Vector;
    readonly type?: number;
    readonly linkNumber?: number;
    readonly grab?: Vector;
    readonly touchPos?: Vector;
}
/**
 * Per-handler detected context. The interpreter sets this before invoking
 * a touch / sensor / collision handler and clears it on return.
 */
interface DetectedContext {
    readonly entries: ReadonlyArray<DetectedEntry>;
}

/**
 * A pending dataserver request. LSL has a small zoo of llRequest*
 * functions that each return a key and later fire the `dataserver` event
 * with the result. We model them all the same way: capture the request,
 * generate a key, expose for tests to respond to via Script.respondToDataserver.
 */
interface DataserverRequestEntry {
    readonly key: string;
    /** "agent_data", "inventory_data", "simulator_data", … — origin builtin name. */
    readonly source: string;
    /** Raw arguments captured for assertion convenience. */
    readonly args: ReadonlyArray<unknown>;
    fulfilled: boolean;
}

/**
 * Captured llMessageLinked invocation. The per-script state.linkedMessages
 * holds invocations originating from one script; the linkset.linkedMessages
 * cross-script capture mirrors all invocations across the linkset.
 */
interface LinkedMessageEntry {
    readonly target: number;
    readonly num: number;
    readonly str: string;
    readonly id: string;
}

/**
 * A registered listen filter. Tests inspect these via Script.listens
 * and can deliver chat through Script.deliverChat to trigger handlers.
 *
 * LSL filtering semantics: an empty `name` / `key` / `message` is a
 * wildcard for that field. A specific value must match exactly.
 */
interface ListenEntry {
    /** Handle returned by llListen; passed to llListenRemove / llListenControl. */
    readonly handle: number;
    readonly channel: number;
    /** Empty string = match any speaker name. */
    readonly name: string;
    /** All-zero UUID = match any speaker key (LSL convention). */
    readonly key: string;
    /** Empty string = match any message. */
    readonly message: string;
    /** Toggled by llListenControl; off entries don't deliver. */
    active: boolean;
}

/**
 * Captured outgoing HTTP request, exposed via Script.httpRequests so tests
 * can assert on what the script fired off, and reply to it via
 * Script.respondToHttp.
 */
interface HttpRequestEntry {
    /** Request key returned by llHTTPRequest; used to match the response. */
    readonly key: string;
    readonly url: string;
    /** Default `GET`; overridden by HTTP_METHOD in the options list. */
    readonly method: string;
    readonly body: string;
    /** Default `text/plain;charset=utf-8`; overridden by HTTP_MIMETYPE. */
    readonly mimetype: string;
    /** Custom headers from HTTP_CUSTOM_HEADER pairs in the options list. */
    readonly headers: ReadonlyArray<readonly [name: string, value: string]>;
    /** Raw, unparsed options list as passed to llHTTPRequest, for completeness. */
    readonly rawOptions: ReadonlyArray<LslValue>;
    /** Whether a response has been fed back to this request yet. */
    fulfilled: boolean;
}

interface ParamSpec {
    readonly name: string;
    readonly type: LslType;
}
interface BuiltinSpec {
    readonly name: string;
    readonly returnType: LslType;
    /** Documented per-call delay in seconds (LSL throttles). */
    readonly delay: number;
    readonly status: 'normal' | 'deprecated' | 'godmode' | 'unimplemented';
    readonly params: ReadonlyArray<ParamSpec>;
}
declare const BUILTIN_SPECS: {
    readonly llAbs: {
        readonly name: "llAbs";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "integer";
        }];
    };
    readonly llAcos: {
        readonly name: "llAcos";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llAddToLandBanList: {
        readonly name: "llAddToLandBanList";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }, {
            readonly name: "hours";
            readonly type: "float";
        }];
    };
    readonly llAddToLandPassList: {
        readonly name: "llAddToLandPassList";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }, {
            readonly name: "hours";
            readonly type: "float";
        }];
    };
    readonly llAdjustDamage: {
        readonly name: "llAdjustDamage";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "index";
            readonly type: "integer";
        }, {
            readonly name: "damage";
            readonly type: "float";
        }];
    };
    readonly llAdjustSoundVolume: {
        readonly name: "llAdjustSoundVolume";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llAgentInExperience: {
        readonly name: "llAgentInExperience";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }];
    };
    readonly llAllowInventoryDrop: {
        readonly name: "llAllowInventoryDrop";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "add";
            readonly type: "integer";
        }];
    };
    readonly llAngleBetween: {
        readonly name: "llAngleBetween";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "a";
            readonly type: "rotation";
        }, {
            readonly name: "b";
            readonly type: "rotation";
        }];
    };
    readonly llApplyImpulse: {
        readonly name: "llApplyImpulse";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "force";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llApplyRotationalImpulse: {
        readonly name: "llApplyRotationalImpulse";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "force";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llAsin: {
        readonly name: "llAsin";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llAtan2: {
        readonly name: "llAtan2";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "y";
            readonly type: "float";
        }, {
            readonly name: "x";
            readonly type: "float";
        }];
    };
    readonly llAttachToAvatar: {
        readonly name: "llAttachToAvatar";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "attach_point";
            readonly type: "integer";
        }];
    };
    readonly llAttachToAvatarTemp: {
        readonly name: "llAttachToAvatarTemp";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "attach_point";
            readonly type: "integer";
        }];
    };
    readonly llAvatarOnLinkSitTarget: {
        readonly name: "llAvatarOnLinkSitTarget";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }];
    };
    readonly llAvatarOnSitTarget: {
        readonly name: "llAvatarOnSitTarget";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llAxes2Rot: {
        readonly name: "llAxes2Rot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "fwd";
            readonly type: "vector";
        }, {
            readonly name: "left";
            readonly type: "vector";
        }, {
            readonly name: "up";
            readonly type: "vector";
        }];
    };
    readonly llAxisAngle2Rot: {
        readonly name: "llAxisAngle2Rot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "axis";
            readonly type: "vector";
        }, {
            readonly name: "angle";
            readonly type: "float";
        }];
    };
    readonly llBase64ToInteger: {
        readonly name: "llBase64ToInteger";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "str";
            readonly type: "string";
        }];
    };
    readonly llBase64ToString: {
        readonly name: "llBase64ToString";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "str";
            readonly type: "string";
        }];
    };
    readonly llBreakAllLinks: {
        readonly name: "llBreakAllLinks";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llBreakLink: {
        readonly name: "llBreakLink";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknum";
            readonly type: "integer";
        }];
    };
    readonly llCSV2List: {
        readonly name: "llCSV2List";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }];
    };
    readonly llCastRay: {
        readonly name: "llCastRay";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "start";
            readonly type: "vector";
        }, {
            readonly name: "end";
            readonly type: "vector";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llCeil: {
        readonly name: "llCeil";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llChar: {
        readonly name: "llChar";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "code";
            readonly type: "integer";
        }];
    };
    readonly llClearCameraParams: {
        readonly name: "llClearCameraParams";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llClearExperiencePermissions: {
        readonly name: "llClearExperiencePermissions";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }];
    };
    readonly llClearLinkMedia: {
        readonly name: "llClearLinkMedia";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llClearPrimMedia: {
        readonly name: "llClearPrimMedia";
        readonly returnType: "integer";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llCloseRemoteDataChannel: {
        readonly name: "llCloseRemoteDataChannel";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "key";
        }];
    };
    readonly llCloud: {
        readonly name: "llCloud";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llCollisionFilter: {
        readonly name: "llCollisionFilter";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "accept";
            readonly type: "integer";
        }];
    };
    readonly llCollisionSound: {
        readonly name: "llCollisionSound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "impact_sound";
            readonly type: "string";
        }, {
            readonly name: "impact_volume";
            readonly type: "float";
        }];
    };
    readonly llCollisionSprite: {
        readonly name: "llCollisionSprite";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "impact_sprite";
            readonly type: "string";
        }];
    };
    readonly llComputeHash: {
        readonly name: "llComputeHash";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "data";
            readonly type: "string";
        }, {
            readonly name: "algorithm";
            readonly type: "string";
        }];
    };
    readonly llCos: {
        readonly name: "llCos";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "theta";
            readonly type: "float";
        }];
    };
    readonly llCreateCharacter: {
        readonly name: "llCreateCharacter";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llCreateKeyValue: {
        readonly name: "llCreateKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "k";
            readonly type: "string";
        }, {
            readonly name: "v";
            readonly type: "string";
        }];
    };
    readonly llCreateLink: {
        readonly name: "llCreateLink";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "parent";
            readonly type: "integer";
        }];
    };
    readonly llDamage: {
        readonly name: "llDamage";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "damage";
            readonly type: "float";
        }, {
            readonly name: "damage_type";
            readonly type: "integer";
        }];
    };
    readonly llDataSizeKeyValue: {
        readonly name: "llDataSizeKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llDeleteCharacter: {
        readonly name: "llDeleteCharacter";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llDeleteKeyValue: {
        readonly name: "llDeleteKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "k";
            readonly type: "string";
        }];
    };
    readonly llDeleteSubList: {
        readonly name: "llDeleteSubList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }];
    };
    readonly llDeleteSubString: {
        readonly name: "llDeleteSubString";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }];
    };
    readonly llDerezObject: {
        readonly name: "llDerezObject";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "mode";
            readonly type: "integer";
        }];
    };
    readonly llDetachFromAvatar: {
        readonly name: "llDetachFromAvatar";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llDetectedDamage: {
        readonly name: "llDetectedDamage";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llDetectedGrab: {
        readonly name: "llDetectedGrab";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedGroup: {
        readonly name: "llDetectedGroup";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedKey: {
        readonly name: "llDetectedKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedLinkNumber: {
        readonly name: "llDetectedLinkNumber";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedName: {
        readonly name: "llDetectedName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedOwner: {
        readonly name: "llDetectedOwner";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedPos: {
        readonly name: "llDetectedPos";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedRezzer: {
        readonly name: "llDetectedRezzer";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llDetectedRot: {
        readonly name: "llDetectedRot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedTouchBinormal: {
        readonly name: "llDetectedTouchBinormal";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedTouchFace: {
        readonly name: "llDetectedTouchFace";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedTouchNormal: {
        readonly name: "llDetectedTouchNormal";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedTouchPos: {
        readonly name: "llDetectedTouchPos";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedTouchST: {
        readonly name: "llDetectedTouchST";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedTouchUV: {
        readonly name: "llDetectedTouchUV";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedType: {
        readonly name: "llDetectedType";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDetectedVel: {
        readonly name: "llDetectedVel";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llDialog: {
        readonly name: "llDialog";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }, {
            readonly name: "message";
            readonly type: "string";
        }, {
            readonly name: "buttons";
            readonly type: "list";
        }, {
            readonly name: "chat_channel";
            readonly type: "integer";
        }];
    };
    readonly llDie: {
        readonly name: "llDie";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llDumpList2String: {
        readonly name: "llDumpList2String";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "separator";
            readonly type: "string";
        }];
    };
    readonly llEdgeOfWorld: {
        readonly name: "llEdgeOfWorld";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "dir";
            readonly type: "vector";
        }];
    };
    readonly llEjectFromLand: {
        readonly name: "llEjectFromLand";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llEmail: {
        readonly name: "llEmail";
        readonly returnType: "void";
        readonly delay: 20;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "address";
            readonly type: "string";
        }, {
            readonly name: "subject";
            readonly type: "string";
        }, {
            readonly name: "message";
            readonly type: "string";
        }];
    };
    readonly llEscapeURL: {
        readonly name: "llEscapeURL";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "url";
            readonly type: "string";
        }];
    };
    readonly llEuler2Rot: {
        readonly name: "llEuler2Rot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "v";
            readonly type: "vector";
        }];
    };
    readonly llEvade: {
        readonly name: "llEvade";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llExecCharacterCmd: {
        readonly name: "llExecCharacterCmd";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "cmd";
            readonly type: "integer";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llFabs: {
        readonly name: "llFabs";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llFindNotecardTextCount: {
        readonly name: "llFindNotecardTextCount";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "pattern";
            readonly type: "string";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llFindNotecardTextSync: {
        readonly name: "llFindNotecardTextSync";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "pattern";
            readonly type: "string";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "count";
            readonly type: "integer";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llFleeFrom: {
        readonly name: "llFleeFrom";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "source";
            readonly type: "vector";
        }, {
            readonly name: "radius";
            readonly type: "float";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llFloor: {
        readonly name: "llFloor";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llForceMouselook: {
        readonly name: "llForceMouselook";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "mouselook";
            readonly type: "integer";
        }];
    };
    readonly llFrand: {
        readonly name: "llFrand";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "mag";
            readonly type: "float";
        }];
    };
    readonly llGenerateKey: {
        readonly name: "llGenerateKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetAccel: {
        readonly name: "llGetAccel";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetAgentInfo: {
        readonly name: "llGetAgentInfo";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetAgentLanguage: {
        readonly name: "llGetAgentLanguage";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llGetAgentList: {
        readonly name: "llGetAgentList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "scope";
            readonly type: "integer";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llGetAgentSize: {
        readonly name: "llGetAgentSize";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetAlpha: {
        readonly name: "llGetAlpha";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llGetAndResetTime: {
        readonly name: "llGetAndResetTime";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetAnimation: {
        readonly name: "llGetAnimation";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetAnimationList: {
        readonly name: "llGetAnimationList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetAnimationOverride: {
        readonly name: "llGetAnimationOverride";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim_state";
            readonly type: "string";
        }];
    };
    readonly llGetAttached: {
        readonly name: "llGetAttached";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetAttachedList: {
        readonly name: "llGetAttachedList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llGetAttachedListFiltered: {
        readonly name: "llGetAttachedListFiltered";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llGetBoundingBox: {
        readonly name: "llGetBoundingBox";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "object";
            readonly type: "key";
        }];
    };
    readonly llGetCameraAspect: {
        readonly name: "llGetCameraAspect";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetCameraFOV: {
        readonly name: "llGetCameraFOV";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetCameraPos: {
        readonly name: "llGetCameraPos";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetCameraRot: {
        readonly name: "llGetCameraRot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetCenterOfMass: {
        readonly name: "llGetCenterOfMass";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetClosestNavPoint: {
        readonly name: "llGetClosestNavPoint";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "point";
            readonly type: "vector";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llGetColor: {
        readonly name: "llGetColor";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llGetCreator: {
        readonly name: "llGetCreator";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetDate: {
        readonly name: "llGetDate";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetDayLength: {
        readonly name: "llGetDayLength";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetDayOffset: {
        readonly name: "llGetDayOffset";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetDisplayName: {
        readonly name: "llGetDisplayName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetEnergy: {
        readonly name: "llGetEnergy";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetEnv: {
        readonly name: "llGetEnv";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llGetEnvironment: {
        readonly name: "llGetEnvironment";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetExperienceDetails: {
        readonly name: "llGetExperienceDetails";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "experience_id";
            readonly type: "key";
        }];
    };
    readonly llGetExperienceErrorMessage: {
        readonly name: "llGetExperienceErrorMessage";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "value";
            readonly type: "integer";
        }];
    };
    readonly llGetExperienceList: {
        readonly name: "llGetExperienceList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }];
    };
    readonly llGetForce: {
        readonly name: "llGetForce";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetFreeMemory: {
        readonly name: "llGetFreeMemory";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetFreeURLs: {
        readonly name: "llGetFreeURLs";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetGMTclock: {
        readonly name: "llGetGMTclock";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetGeometricCenter: {
        readonly name: "llGetGeometricCenter";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetHTTPHeader: {
        readonly name: "llGetHTTPHeader";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "request_id";
            readonly type: "key";
        }, {
            readonly name: "header";
            readonly type: "string";
        }];
    };
    readonly llGetHealth: {
        readonly name: "llGetHealth";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetInventoryAcquireTime: {
        readonly name: "llGetInventoryAcquireTime";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "item";
            readonly type: "string";
        }];
    };
    readonly llGetInventoryCreator: {
        readonly name: "llGetInventoryCreator";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "item";
            readonly type: "string";
        }];
    };
    readonly llGetInventoryDesc: {
        readonly name: "llGetInventoryDesc";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "itemname";
            readonly type: "string";
        }];
    };
    readonly llGetInventoryKey: {
        readonly name: "llGetInventoryKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llGetInventoryName: {
        readonly name: "llGetInventoryName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "type";
            readonly type: "integer";
        }, {
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llGetInventoryNumber: {
        readonly name: "llGetInventoryNumber";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "type";
            readonly type: "integer";
        }];
    };
    readonly llGetInventoryPermMask: {
        readonly name: "llGetInventoryPermMask";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "item";
            readonly type: "string";
        }, {
            readonly name: "mask";
            readonly type: "integer";
        }];
    };
    readonly llGetInventoryType: {
        readonly name: "llGetInventoryType";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llGetKey: {
        readonly name: "llGetKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetLandOwnerAt: {
        readonly name: "llGetLandOwnerAt";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llGetLinkKey: {
        readonly name: "llGetLinkKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }];
    };
    readonly llGetLinkMedia: {
        readonly name: "llGetLinkMedia";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetLinkName: {
        readonly name: "llGetLinkName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }];
    };
    readonly llGetLinkNumber: {
        readonly name: "llGetLinkNumber";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetLinkNumberOfSides: {
        readonly name: "llGetLinkNumberOfSides";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }];
    };
    readonly llGetLinkPrimitiveParams: {
        readonly name: "llGetLinkPrimitiveParams";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llGetLinkSitFlags: {
        readonly name: "llGetLinkSitFlags";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }];
    };
    readonly llGetListEntryType: {
        readonly name: "llGetListEntryType";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llGetListLength: {
        readonly name: "llGetListLength";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }];
    };
    readonly llGetLocalPos: {
        readonly name: "llGetLocalPos";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetLocalRot: {
        readonly name: "llGetLocalRot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMass: {
        readonly name: "llGetMass";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMassMKS: {
        readonly name: "llGetMassMKS";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMaxScaleFactor: {
        readonly name: "llGetMaxScaleFactor";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMemoryLimit: {
        readonly name: "llGetMemoryLimit";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMinScaleFactor: {
        readonly name: "llGetMinScaleFactor";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMoonDirection: {
        readonly name: "llGetMoonDirection";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetMoonRotation: {
        readonly name: "llGetMoonRotation";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetNextEmail: {
        readonly name: "llGetNextEmail";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "address";
            readonly type: "string";
        }, {
            readonly name: "subject";
            readonly type: "string";
        }];
    };
    readonly llGetNotecardLine: {
        readonly name: "llGetNotecardLine";
        readonly returnType: "key";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "line";
            readonly type: "integer";
        }];
    };
    readonly llGetNotecardLineSync: {
        readonly name: "llGetNotecardLineSync";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "line";
            readonly type: "integer";
        }];
    };
    readonly llGetNumberOfNotecardLines: {
        readonly name: "llGetNumberOfNotecardLines";
        readonly returnType: "key";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llGetNumberOfPrims: {
        readonly name: "llGetNumberOfPrims";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetNumberOfSides: {
        readonly name: "llGetNumberOfSides";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetObjectAnimationNames: {
        readonly name: "llGetObjectAnimationNames";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetObjectDesc: {
        readonly name: "llGetObjectDesc";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetObjectDetails: {
        readonly name: "llGetObjectDetails";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetObjectLinkKey: {
        readonly name: "llGetObjectLinkKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "object_id";
            readonly type: "key";
        }, {
            readonly name: "link";
            readonly type: "integer";
        }];
    };
    readonly llGetObjectMass: {
        readonly name: "llGetObjectMass";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetObjectName: {
        readonly name: "llGetObjectName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetObjectPermMask: {
        readonly name: "llGetObjectPermMask";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "mask";
            readonly type: "integer";
        }];
    };
    readonly llGetObjectPrimCount: {
        readonly name: "llGetObjectPrimCount";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "object_id";
            readonly type: "key";
        }];
    };
    readonly llGetOmega: {
        readonly name: "llGetOmega";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetOwner: {
        readonly name: "llGetOwner";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetOwnerKey: {
        readonly name: "llGetOwnerKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetParcelDetails: {
        readonly name: "llGetParcelDetails";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetParcelFlags: {
        readonly name: "llGetParcelFlags";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llGetParcelMaxPrims: {
        readonly name: "llGetParcelMaxPrims";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "sim_wide";
            readonly type: "integer";
        }];
    };
    readonly llGetParcelMusicURL: {
        readonly name: "llGetParcelMusicURL";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetParcelPrimCount: {
        readonly name: "llGetParcelPrimCount";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "category";
            readonly type: "integer";
        }, {
            readonly name: "sim_wide";
            readonly type: "integer";
        }];
    };
    readonly llGetParcelPrimOwners: {
        readonly name: "llGetParcelPrimOwners";
        readonly returnType: "list";
        readonly delay: 2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llGetPermissions: {
        readonly name: "llGetPermissions";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetPermissionsKey: {
        readonly name: "llGetPermissionsKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetPhysicsMaterial: {
        readonly name: "llGetPhysicsMaterial";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetPos: {
        readonly name: "llGetPos";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetPrimMediaParams: {
        readonly name: "llGetPrimMediaParams";
        readonly returnType: "list";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetPrimitiveParams: {
        readonly name: "llGetPrimitiveParams";
        readonly returnType: "list";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetRegionAgentCount: {
        readonly name: "llGetRegionAgentCount";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionCorner: {
        readonly name: "llGetRegionCorner";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionDayLength: {
        readonly name: "llGetRegionDayLength";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionDayOffset: {
        readonly name: "llGetRegionDayOffset";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionFPS: {
        readonly name: "llGetRegionFPS";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionFlags: {
        readonly name: "llGetRegionFlags";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionMoonDirection: {
        readonly name: "llGetRegionMoonDirection";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionMoonRotation: {
        readonly name: "llGetRegionMoonRotation";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionName: {
        readonly name: "llGetRegionName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionSunDirection: {
        readonly name: "llGetRegionSunDirection";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionSunRotation: {
        readonly name: "llGetRegionSunRotation";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionTimeDilation: {
        readonly name: "llGetRegionTimeDilation";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRegionTimeOfDay: {
        readonly name: "llGetRegionTimeOfDay";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRenderMaterial: {
        readonly name: "llGetRenderMaterial";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llGetRootPosition: {
        readonly name: "llGetRootPosition";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRootRotation: {
        readonly name: "llGetRootRotation";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetRot: {
        readonly name: "llGetRot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetSPMaxMemory: {
        readonly name: "llGetSPMaxMemory";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetScale: {
        readonly name: "llGetScale";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetScriptName: {
        readonly name: "llGetScriptName";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetScriptState: {
        readonly name: "llGetScriptState";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llGetSimStats: {
        readonly name: "llGetSimStats";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "stat_type";
            readonly type: "integer";
        }];
    };
    readonly llGetSimulatorHostname: {
        readonly name: "llGetSimulatorHostname";
        readonly returnType: "string";
        readonly delay: 10;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetStartParameter: {
        readonly name: "llGetStartParameter";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetStartString: {
        readonly name: "llGetStartString";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetStaticPath: {
        readonly name: "llGetStaticPath";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "start";
            readonly type: "vector";
        }, {
            readonly name: "end";
            readonly type: "vector";
        }, {
            readonly name: "radius";
            readonly type: "float";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetStatus: {
        readonly name: "llGetStatus";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "status";
            readonly type: "integer";
        }];
    };
    readonly llGetSubString: {
        readonly name: "llGetSubString";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }];
    };
    readonly llGetSunDirection: {
        readonly name: "llGetSunDirection";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetSunRotation: {
        readonly name: "llGetSunRotation";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetTexture: {
        readonly name: "llGetTexture";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llGetTextureOffset: {
        readonly name: "llGetTextureOffset";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llGetTextureRot: {
        readonly name: "llGetTextureRot";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "side";
            readonly type: "integer";
        }];
    };
    readonly llGetTextureScale: {
        readonly name: "llGetTextureScale";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "side";
            readonly type: "integer";
        }];
    };
    readonly llGetTime: {
        readonly name: "llGetTime";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetTimeOfDay: {
        readonly name: "llGetTimeOfDay";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetTimestamp: {
        readonly name: "llGetTimestamp";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetTorque: {
        readonly name: "llGetTorque";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetUnixTime: {
        readonly name: "llGetUnixTime";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetUsedMemory: {
        readonly name: "llGetUsedMemory";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetUsername: {
        readonly name: "llGetUsername";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llGetVel: {
        readonly name: "llGetVel";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGetVisualParams: {
        readonly name: "llGetVisualParams";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agentid";
            readonly type: "key";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llGetWallclock: {
        readonly name: "llGetWallclock";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llGiveAgentInventory: {
        readonly name: "llGiveAgentInventory";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "folder";
            readonly type: "string";
        }, {
            readonly name: "items";
            readonly type: "list";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llGiveInventory: {
        readonly name: "llGiveInventory";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "destination";
            readonly type: "key";
        }, {
            readonly name: "inventory";
            readonly type: "string";
        }];
    };
    readonly llGiveInventoryList: {
        readonly name: "llGiveInventoryList";
        readonly returnType: "void";
        readonly delay: 3;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "folder";
            readonly type: "string";
        }, {
            readonly name: "inventory";
            readonly type: "list";
        }];
    };
    readonly llGiveMoney: {
        readonly name: "llGiveMoney";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "destination";
            readonly type: "key";
        }, {
            readonly name: "amount";
            readonly type: "integer";
        }];
    };
    readonly llGodLikeRezObject: {
        readonly name: "llGodLikeRezObject";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "godmode";
        readonly params: readonly [{
            readonly name: "inventory";
            readonly type: "key";
        }, {
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llGround: {
        readonly name: "llGround";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llGroundContour: {
        readonly name: "llGroundContour";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llGroundNormal: {
        readonly name: "llGroundNormal";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llGroundRepel: {
        readonly name: "llGroundRepel";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "height";
            readonly type: "float";
        }, {
            readonly name: "water";
            readonly type: "integer";
        }, {
            readonly name: "tau";
            readonly type: "float";
        }];
    };
    readonly llGroundSlope: {
        readonly name: "llGroundSlope";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llHMAC: {
        readonly name: "llHMAC";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "authkey";
            readonly type: "string";
        }, {
            readonly name: "message";
            readonly type: "string";
        }, {
            readonly name: "hashalg";
            readonly type: "string";
        }];
    };
    readonly llHTTPRequest: {
        readonly name: "llHTTPRequest";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "url";
            readonly type: "string";
        }, {
            readonly name: "parameters";
            readonly type: "list";
        }, {
            readonly name: "body";
            readonly type: "string";
        }];
    };
    readonly llHTTPResponse: {
        readonly name: "llHTTPResponse";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "request_id";
            readonly type: "key";
        }, {
            readonly name: "status";
            readonly type: "integer";
        }, {
            readonly name: "body";
            readonly type: "string";
        }];
    };
    readonly llHash: {
        readonly name: "llHash";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "string";
        }];
    };
    readonly llInsertString: {
        readonly name: "llInsertString";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "dst";
            readonly type: "string";
        }, {
            readonly name: "position";
            readonly type: "integer";
        }, {
            readonly name: "src";
            readonly type: "string";
        }];
    };
    readonly llInstantMessage: {
        readonly name: "llInstantMessage";
        readonly returnType: "void";
        readonly delay: 2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "user";
            readonly type: "key";
        }, {
            readonly name: "message";
            readonly type: "string";
        }];
    };
    readonly llIntegerToBase64: {
        readonly name: "llIntegerToBase64";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llIsFriend: {
        readonly name: "llIsFriend";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }];
    };
    readonly llJson2List: {
        readonly name: "llJson2List";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "json";
            readonly type: "string";
        }];
    };
    readonly llJsonGetValue: {
        readonly name: "llJsonGetValue";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "json";
            readonly type: "string";
        }, {
            readonly name: "specifiers";
            readonly type: "list";
        }];
    };
    readonly llJsonSetValue: {
        readonly name: "llJsonSetValue";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "json";
            readonly type: "string";
        }, {
            readonly name: "specifiers";
            readonly type: "list";
        }, {
            readonly name: "value";
            readonly type: "string";
        }];
    };
    readonly llJsonValueType: {
        readonly name: "llJsonValueType";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "json";
            readonly type: "string";
        }, {
            readonly name: "specifiers";
            readonly type: "list";
        }];
    };
    readonly llKey2Name: {
        readonly name: "llKey2Name";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llKeyCountKeyValue: {
        readonly name: "llKeyCountKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llKeysKeyValue: {
        readonly name: "llKeysKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "count";
            readonly type: "integer";
        }];
    };
    readonly llLinear2sRGB: {
        readonly name: "llLinear2sRGB";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "color";
            readonly type: "vector";
        }];
    };
    readonly llLinkAdjustSoundVolume: {
        readonly name: "llLinkAdjustSoundVolume";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llLinkParticleSystem: {
        readonly name: "llLinkParticleSystem";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llLinkPlaySound: {
        readonly name: "llLinkPlaySound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }, {
            readonly name: "flags";
            readonly type: "integer";
        }];
    };
    readonly llLinkSetSoundQueueing: {
        readonly name: "llLinkSetSoundQueueing";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "queue";
            readonly type: "integer";
        }];
    };
    readonly llLinkSetSoundRadius: {
        readonly name: "llLinkSetSoundRadius";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "radius";
            readonly type: "float";
        }];
    };
    readonly llLinkSitTarget: {
        readonly name: "llLinkSitTarget";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "offset";
            readonly type: "vector";
        }, {
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llLinkStopSound: {
        readonly name: "llLinkStopSound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }];
    };
    readonly llLinksetDataAvailable: {
        readonly name: "llLinksetDataAvailable";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llLinksetDataCountFound: {
        readonly name: "llLinksetDataCountFound";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pattern";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataCountKeys: {
        readonly name: "llLinksetDataCountKeys";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llLinksetDataDelete: {
        readonly name: "llLinksetDataDelete";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataDeleteFound: {
        readonly name: "llLinksetDataDeleteFound";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pattern";
            readonly type: "string";
        }, {
            readonly name: "pass";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataDeleteProtected: {
        readonly name: "llLinksetDataDeleteProtected";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "password";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataFindKeys: {
        readonly name: "llLinksetDataFindKeys";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pattern";
            readonly type: "string";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "count";
            readonly type: "integer";
        }];
    };
    readonly llLinksetDataListKeys: {
        readonly name: "llLinksetDataListKeys";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "count";
            readonly type: "integer";
        }];
    };
    readonly llLinksetDataRead: {
        readonly name: "llLinksetDataRead";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataReadProtected: {
        readonly name: "llLinksetDataReadProtected";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "password";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataReset: {
        readonly name: "llLinksetDataReset";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llLinksetDataWrite: {
        readonly name: "llLinksetDataWrite";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "value";
            readonly type: "string";
        }];
    };
    readonly llLinksetDataWriteProtected: {
        readonly name: "llLinksetDataWriteProtected";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "value";
            readonly type: "string";
        }, {
            readonly name: "password";
            readonly type: "string";
        }];
    };
    readonly llList2CSV: {
        readonly name: "llList2CSV";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }];
    };
    readonly llList2Float: {
        readonly name: "llList2Float";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llList2Integer: {
        readonly name: "llList2Integer";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llList2Json: {
        readonly name: "llList2Json";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "type";
            readonly type: "string";
        }, {
            readonly name: "values";
            readonly type: "list";
        }];
    };
    readonly llList2Key: {
        readonly name: "llList2Key";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llList2List: {
        readonly name: "llList2List";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }];
    };
    readonly llList2ListSlice: {
        readonly name: "llList2ListSlice";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }, {
            readonly name: "stride";
            readonly type: "integer";
        }, {
            readonly name: "slice_index";
            readonly type: "integer";
        }];
    };
    readonly llList2ListStrided: {
        readonly name: "llList2ListStrided";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }, {
            readonly name: "stride";
            readonly type: "integer";
        }];
    };
    readonly llList2Rot: {
        readonly name: "llList2Rot";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llList2String: {
        readonly name: "llList2String";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llList2Vector: {
        readonly name: "llList2Vector";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llListFindList: {
        readonly name: "llListFindList";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "test";
            readonly type: "list";
        }];
    };
    readonly llListFindListNext: {
        readonly name: "llListFindListNext";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "test";
            readonly type: "list";
        }, {
            readonly name: "n";
            readonly type: "integer";
        }];
    };
    readonly llListFindStrided: {
        readonly name: "llListFindStrided";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "test";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }, {
            readonly name: "stride";
            readonly type: "integer";
        }];
    };
    readonly llListInsertList: {
        readonly name: "llListInsertList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "dest";
            readonly type: "list";
        }, {
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }];
    };
    readonly llListRandomize: {
        readonly name: "llListRandomize";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "stride";
            readonly type: "integer";
        }];
    };
    readonly llListReplaceList: {
        readonly name: "llListReplaceList";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "dest";
            readonly type: "list";
        }, {
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "start";
            readonly type: "integer";
        }, {
            readonly name: "end";
            readonly type: "integer";
        }];
    };
    readonly llListSort: {
        readonly name: "llListSort";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "stride";
            readonly type: "integer";
        }, {
            readonly name: "ascending";
            readonly type: "integer";
        }];
    };
    readonly llListSortStrided: {
        readonly name: "llListSortStrided";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "list";
        }, {
            readonly name: "stride";
            readonly type: "integer";
        }, {
            readonly name: "stride_index";
            readonly type: "integer";
        }, {
            readonly name: "ascending";
            readonly type: "integer";
        }];
    };
    readonly llListStatistics: {
        readonly name: "llListStatistics";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "operation";
            readonly type: "integer";
        }, {
            readonly name: "src";
            readonly type: "list";
        }];
    };
    readonly llListen: {
        readonly name: "llListen";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llListenControl: {
        readonly name: "llListenControl";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }, {
            readonly name: "active";
            readonly type: "integer";
        }];
    };
    readonly llListenRemove: {
        readonly name: "llListenRemove";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llLoadURL: {
        readonly name: "llLoadURL";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }, {
            readonly name: "message";
            readonly type: "string";
        }, {
            readonly name: "url";
            readonly type: "string";
        }];
    };
    readonly llLog: {
        readonly name: "llLog";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llLog10: {
        readonly name: "llLog10";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llLookAt: {
        readonly name: "llLookAt";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "vector";
        }, {
            readonly name: "strength";
            readonly type: "float";
        }, {
            readonly name: "damping";
            readonly type: "float";
        }];
    };
    readonly llLoopSound: {
        readonly name: "llLoopSound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llLoopSoundMaster: {
        readonly name: "llLoopSoundMaster";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llLoopSoundSlave: {
        readonly name: "llLoopSoundSlave";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llMD5String: {
        readonly name: "llMD5String";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "nonce";
            readonly type: "integer";
        }];
    };
    readonly llMakeExplosion: {
        readonly name: "llMakeExplosion";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "particles";
            readonly type: "integer";
        }, {
            readonly name: "scale";
            readonly type: "float";
        }, {
            readonly name: "vel";
            readonly type: "float";
        }, {
            readonly name: "lifetime";
            readonly type: "float";
        }, {
            readonly name: "arc";
            readonly type: "float";
        }, {
            readonly name: "texture";
            readonly type: "string";
        }, {
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llMakeFire: {
        readonly name: "llMakeFire";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "particles";
            readonly type: "integer";
        }, {
            readonly name: "scale";
            readonly type: "float";
        }, {
            readonly name: "vel";
            readonly type: "float";
        }, {
            readonly name: "lifetime";
            readonly type: "float";
        }, {
            readonly name: "arc";
            readonly type: "float";
        }, {
            readonly name: "texture";
            readonly type: "string";
        }, {
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llMakeFountain: {
        readonly name: "llMakeFountain";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "particles";
            readonly type: "integer";
        }, {
            readonly name: "scale";
            readonly type: "float";
        }, {
            readonly name: "vel";
            readonly type: "float";
        }, {
            readonly name: "lifetime";
            readonly type: "float";
        }, {
            readonly name: "arc";
            readonly type: "float";
        }, {
            readonly name: "bounce";
            readonly type: "integer";
        }, {
            readonly name: "texture";
            readonly type: "string";
        }, {
            readonly name: "offset";
            readonly type: "vector";
        }, {
            readonly name: "bounce_offset";
            readonly type: "float";
        }];
    };
    readonly llMakeSmoke: {
        readonly name: "llMakeSmoke";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "particles";
            readonly type: "integer";
        }, {
            readonly name: "scale";
            readonly type: "float";
        }, {
            readonly name: "vel";
            readonly type: "float";
        }, {
            readonly name: "lifetime";
            readonly type: "float";
        }, {
            readonly name: "arc";
            readonly type: "float";
        }, {
            readonly name: "texture";
            readonly type: "string";
        }, {
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llManageEstateAccess: {
        readonly name: "llManageEstateAccess";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "action";
            readonly type: "integer";
        }, {
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llMapBeacon: {
        readonly name: "llMapBeacon";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "region";
            readonly type: "string";
        }, {
            readonly name: "position";
            readonly type: "vector";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llMapDestination: {
        readonly name: "llMapDestination";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "simname";
            readonly type: "string";
        }, {
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "look_at";
            readonly type: "vector";
        }];
    };
    readonly llMessageLinked: {
        readonly name: "llMessageLinked";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknum";
            readonly type: "integer";
        }, {
            readonly name: "num";
            readonly type: "integer";
        }, {
            readonly name: "str";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llMinEventDelay: {
        readonly name: "llMinEventDelay";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "delay";
            readonly type: "float";
        }];
    };
    readonly llModPow: {
        readonly name: "llModPow";
        readonly returnType: "integer";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "a";
            readonly type: "integer";
        }, {
            readonly name: "b";
            readonly type: "integer";
        }, {
            readonly name: "c";
            readonly type: "integer";
        }];
    };
    readonly llModifyLand: {
        readonly name: "llModifyLand";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "action";
            readonly type: "integer";
        }, {
            readonly name: "brush";
            readonly type: "integer";
        }];
    };
    readonly llMoveToTarget: {
        readonly name: "llMoveToTarget";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "vector";
        }, {
            readonly name: "tau";
            readonly type: "float";
        }];
    };
    readonly llName2Key: {
        readonly name: "llName2Key";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llNavigateTo: {
        readonly name: "llNavigateTo";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "point";
            readonly type: "vector";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llOffsetTexture: {
        readonly name: "llOffsetTexture";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "u";
            readonly type: "float";
        }, {
            readonly name: "v";
            readonly type: "float";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llOpenFloater: {
        readonly name: "llOpenFloater";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "godmode";
        readonly params: readonly [{
            readonly name: "floater_name";
            readonly type: "string";
        }, {
            readonly name: "url";
            readonly type: "string";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llOpenRemoteDataChannel: {
        readonly name: "llOpenRemoteDataChannel";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "deprecated";
        readonly params: readonly [];
    };
    readonly llOrd: {
        readonly name: "llOrd";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "string";
        }, {
            readonly name: "index";
            readonly type: "integer";
        }];
    };
    readonly llOverMyLand: {
        readonly name: "llOverMyLand";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llOwnerSay: {
        readonly name: "llOwnerSay";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llParcelMediaCommandList: {
        readonly name: "llParcelMediaCommandList";
        readonly returnType: "void";
        readonly delay: 2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "command";
            readonly type: "list";
        }];
    };
    readonly llParcelMediaQuery: {
        readonly name: "llParcelMediaQuery";
        readonly returnType: "list";
        readonly delay: 2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "query";
            readonly type: "list";
        }];
    };
    readonly llParseString2List: {
        readonly name: "llParseString2List";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "separators";
            readonly type: "list";
        }, {
            readonly name: "spacers";
            readonly type: "list";
        }];
    };
    readonly llParseStringKeepNulls: {
        readonly name: "llParseStringKeepNulls";
        readonly returnType: "list";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "separators";
            readonly type: "list";
        }, {
            readonly name: "spacers";
            readonly type: "list";
        }];
    };
    readonly llParticleSystem: {
        readonly name: "llParticleSystem";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llPassCollisions: {
        readonly name: "llPassCollisions";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pass";
            readonly type: "integer";
        }];
    };
    readonly llPassTouches: {
        readonly name: "llPassTouches";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pass";
            readonly type: "integer";
        }];
    };
    readonly llPatrolPoints: {
        readonly name: "llPatrolPoints";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "points";
            readonly type: "list";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llPlaySound: {
        readonly name: "llPlaySound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llPlaySoundSlave: {
        readonly name: "llPlaySoundSlave";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llPointAt: {
        readonly name: "llPointAt";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llPow: {
        readonly name: "llPow";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "base";
            readonly type: "float";
        }, {
            readonly name: "exponent";
            readonly type: "float";
        }];
    };
    readonly llPreloadSound: {
        readonly name: "llPreloadSound";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }];
    };
    readonly llPursue: {
        readonly name: "llPursue";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llPushObject: {
        readonly name: "llPushObject";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "impulse";
            readonly type: "vector";
        }, {
            readonly name: "ang_impulse";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llReadKeyValue: {
        readonly name: "llReadKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "k";
            readonly type: "string";
        }];
    };
    readonly llRefreshPrimURL: {
        readonly name: "llRefreshPrimURL";
        readonly returnType: "void";
        readonly delay: 20;
        readonly status: "unimplemented";
        readonly params: readonly [];
    };
    readonly llRegionSay: {
        readonly name: "llRegionSay";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llRegionSayTo: {
        readonly name: "llRegionSayTo";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llReleaseCamera: {
        readonly name: "llReleaseCamera";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llReleaseControls: {
        readonly name: "llReleaseControls";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llReleaseURL: {
        readonly name: "llReleaseURL";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "url";
            readonly type: "string";
        }];
    };
    readonly llRemoteDataReply: {
        readonly name: "llRemoteDataReply";
        readonly returnType: "void";
        readonly delay: 3;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "key";
        }, {
            readonly name: "message_id";
            readonly type: "key";
        }, {
            readonly name: "sdata";
            readonly type: "string";
        }, {
            readonly name: "idata";
            readonly type: "integer";
        }];
    };
    readonly llRemoteDataSetRegion: {
        readonly name: "llRemoteDataSetRegion";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "deprecated";
        readonly params: readonly [];
    };
    readonly llRemoteLoadScript: {
        readonly name: "llRemoteLoadScript";
        readonly returnType: "void";
        readonly delay: 3;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "running";
            readonly type: "integer";
        }, {
            readonly name: "start_param";
            readonly type: "integer";
        }];
    };
    readonly llRemoteLoadScriptPin: {
        readonly name: "llRemoteLoadScriptPin";
        readonly returnType: "void";
        readonly delay: 3;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "key";
        }, {
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "pin";
            readonly type: "integer";
        }, {
            readonly name: "running";
            readonly type: "integer";
        }, {
            readonly name: "start_param";
            readonly type: "integer";
        }];
    };
    readonly llRemoveFromLandBanList: {
        readonly name: "llRemoveFromLandBanList";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llRemoveFromLandPassList: {
        readonly name: "llRemoveFromLandPassList";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llRemoveInventory: {
        readonly name: "llRemoveInventory";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "item";
            readonly type: "string";
        }];
    };
    readonly llRemoveVehicleFlags: {
        readonly name: "llRemoveVehicleFlags";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "flags";
            readonly type: "integer";
        }];
    };
    readonly llReplaceAgentEnvironment: {
        readonly name: "llReplaceAgentEnvironment";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent_id";
            readonly type: "key";
        }, {
            readonly name: "transition";
            readonly type: "float";
        }, {
            readonly name: "environment";
            readonly type: "string";
        }];
    };
    readonly llReplaceEnvironment: {
        readonly name: "llReplaceEnvironment";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "position";
            readonly type: "vector";
        }, {
            readonly name: "environment";
            readonly type: "string";
        }, {
            readonly name: "track_no";
            readonly type: "integer";
        }, {
            readonly name: "day_length";
            readonly type: "integer";
        }, {
            readonly name: "day_offset";
            readonly type: "integer";
        }];
    };
    readonly llReplaceSubString: {
        readonly name: "llReplaceSubString";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "pattern";
            readonly type: "string";
        }, {
            readonly name: "replacement_pattern";
            readonly type: "string";
        }, {
            readonly name: "count";
            readonly type: "integer";
        }];
    };
    readonly llRequestAgentData: {
        readonly name: "llRequestAgentData";
        readonly returnType: "key";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "data";
            readonly type: "integer";
        }];
    };
    readonly llRequestDisplayName: {
        readonly name: "llRequestDisplayName";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llRequestExperiencePermissions: {
        readonly name: "llRequestExperiencePermissions";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llRequestInventoryData: {
        readonly name: "llRequestInventoryData";
        readonly returnType: "key";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llRequestPermissions: {
        readonly name: "llRequestPermissions";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "perm";
            readonly type: "integer";
        }];
    };
    readonly llRequestSecureURL: {
        readonly name: "llRequestSecureURL";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llRequestSimulatorData: {
        readonly name: "llRequestSimulatorData";
        readonly returnType: "key";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "simulator";
            readonly type: "string";
        }, {
            readonly name: "data";
            readonly type: "integer";
        }];
    };
    readonly llRequestURL: {
        readonly name: "llRequestURL";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llRequestUserKey: {
        readonly name: "llRequestUserKey";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "username";
            readonly type: "string";
        }];
    };
    readonly llRequestUsername: {
        readonly name: "llRequestUsername";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llResetAnimationOverride: {
        readonly name: "llResetAnimationOverride";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim_state";
            readonly type: "string";
        }];
    };
    readonly llResetLandBanList: {
        readonly name: "llResetLandBanList";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llResetLandPassList: {
        readonly name: "llResetLandPassList";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llResetOtherScript: {
        readonly name: "llResetOtherScript";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llResetScript: {
        readonly name: "llResetScript";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llResetTime: {
        readonly name: "llResetTime";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llReturnObjectsByID: {
        readonly name: "llReturnObjectsByID";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "objects";
            readonly type: "list";
        }];
    };
    readonly llReturnObjectsByOwner: {
        readonly name: "llReturnObjectsByOwner";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "owner";
            readonly type: "key";
        }, {
            readonly name: "scope";
            readonly type: "integer";
        }];
    };
    readonly llRezAtRoot: {
        readonly name: "llRezAtRoot";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "inventory";
            readonly type: "string";
        }, {
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "vel";
            readonly type: "vector";
        }, {
            readonly name: "rot";
            readonly type: "rotation";
        }, {
            readonly name: "param";
            readonly type: "integer";
        }];
    };
    readonly llRezObject: {
        readonly name: "llRezObject";
        readonly returnType: "void";
        readonly delay: 0.1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "inventory";
            readonly type: "string";
        }, {
            readonly name: "pos";
            readonly type: "vector";
        }, {
            readonly name: "vel";
            readonly type: "vector";
        }, {
            readonly name: "rot";
            readonly type: "rotation";
        }, {
            readonly name: "param";
            readonly type: "integer";
        }];
    };
    readonly llRezObjectWithParams: {
        readonly name: "llRezObjectWithParams";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "itemname";
            readonly type: "string";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llRot2Angle: {
        readonly name: "llRot2Angle";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llRot2Axis: {
        readonly name: "llRot2Axis";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llRot2Euler: {
        readonly name: "llRot2Euler";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "q";
            readonly type: "rotation";
        }];
    };
    readonly llRot2Fwd: {
        readonly name: "llRot2Fwd";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "q";
            readonly type: "rotation";
        }];
    };
    readonly llRot2Left: {
        readonly name: "llRot2Left";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "q";
            readonly type: "rotation";
        }];
    };
    readonly llRot2Up: {
        readonly name: "llRot2Up";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "q";
            readonly type: "rotation";
        }];
    };
    readonly llRotBetween: {
        readonly name: "llRotBetween";
        readonly returnType: "rotation";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "v1";
            readonly type: "vector";
        }, {
            readonly name: "v2";
            readonly type: "vector";
        }];
    };
    readonly llRotLookAt: {
        readonly name: "llRotLookAt";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "rotation";
        }, {
            readonly name: "strength";
            readonly type: "float";
        }, {
            readonly name: "damping";
            readonly type: "float";
        }];
    };
    readonly llRotTarget: {
        readonly name: "llRotTarget";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rot";
            readonly type: "rotation";
        }, {
            readonly name: "error";
            readonly type: "float";
        }];
    };
    readonly llRotTargetRemove: {
        readonly name: "llRotTargetRemove";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llRotateTexture: {
        readonly name: "llRotateTexture";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "angle";
            readonly type: "float";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llRound: {
        readonly name: "llRound";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llSHA1String: {
        readonly name: "llSHA1String";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }];
    };
    readonly llSHA256String: {
        readonly name: "llSHA256String";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }];
    };
    readonly llSameGroup: {
        readonly name: "llSameGroup";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llSay: {
        readonly name: "llSay";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llScaleByFactor: {
        readonly name: "llScaleByFactor";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "scaling_factor";
            readonly type: "float";
        }];
    };
    readonly llScaleTexture: {
        readonly name: "llScaleTexture";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "u";
            readonly type: "float";
        }, {
            readonly name: "v";
            readonly type: "float";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llScriptDanger: {
        readonly name: "llScriptDanger";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llScriptProfiler: {
        readonly name: "llScriptProfiler";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "flags";
            readonly type: "integer";
        }];
    };
    readonly llSendRemoteData: {
        readonly name: "llSendRemoteData";
        readonly returnType: "key";
        readonly delay: 3;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "key";
        }, {
            readonly name: "dest";
            readonly type: "string";
        }, {
            readonly name: "idata";
            readonly type: "integer";
        }, {
            readonly name: "sdata";
            readonly type: "string";
        }];
    };
    readonly llSensor: {
        readonly name: "llSensor";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "type";
            readonly type: "integer";
        }, {
            readonly name: "range";
            readonly type: "float";
        }, {
            readonly name: "arc";
            readonly type: "float";
        }];
    };
    readonly llSensorRemove: {
        readonly name: "llSensorRemove";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llSensorRepeat: {
        readonly name: "llSensorRepeat";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "type";
            readonly type: "integer";
        }, {
            readonly name: "range";
            readonly type: "float";
        }, {
            readonly name: "arc";
            readonly type: "float";
        }, {
            readonly name: "rate";
            readonly type: "float";
        }];
    };
    readonly llSetAgentEnvironment: {
        readonly name: "llSetAgentEnvironment";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent_id";
            readonly type: "key";
        }, {
            readonly name: "transition";
            readonly type: "float";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llSetAgentRot: {
        readonly name: "llSetAgentRot";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "orientation";
            readonly type: "rotation";
        }, {
            readonly name: "flags";
            readonly type: "integer";
        }];
    };
    readonly llSetAlpha: {
        readonly name: "llSetAlpha";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "alpha";
            readonly type: "float";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetAngularVelocity: {
        readonly name: "llSetAngularVelocity";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "angular_velocity";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llSetAnimationOverride: {
        readonly name: "llSetAnimationOverride";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim_state";
            readonly type: "string";
        }, {
            readonly name: "anim";
            readonly type: "string";
        }];
    };
    readonly llSetBuoyancy: {
        readonly name: "llSetBuoyancy";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "buoyancy";
            readonly type: "float";
        }];
    };
    readonly llSetCameraAtOffset: {
        readonly name: "llSetCameraAtOffset";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llSetCameraEyeOffset: {
        readonly name: "llSetCameraEyeOffset";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llSetCameraParams: {
        readonly name: "llSetCameraParams";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llSetClickAction: {
        readonly name: "llSetClickAction";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "action";
            readonly type: "integer";
        }];
    };
    readonly llSetColor: {
        readonly name: "llSetColor";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "color";
            readonly type: "vector";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetContentType: {
        readonly name: "llSetContentType";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "request_id";
            readonly type: "key";
        }, {
            readonly name: "content_type";
            readonly type: "integer";
        }];
    };
    readonly llSetDamage: {
        readonly name: "llSetDamage";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "damage";
            readonly type: "float";
        }];
    };
    readonly llSetEnvironment: {
        readonly name: "llSetEnvironment";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "position";
            readonly type: "vector";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llSetForce: {
        readonly name: "llSetForce";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "force";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llSetForceAndTorque: {
        readonly name: "llSetForceAndTorque";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "force";
            readonly type: "vector";
        }, {
            readonly name: "torque";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llSetHoverHeight: {
        readonly name: "llSetHoverHeight";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "height";
            readonly type: "float";
        }, {
            readonly name: "water";
            readonly type: "integer";
        }, {
            readonly name: "tau";
            readonly type: "float";
        }];
    };
    readonly llSetInventoryPermMask: {
        readonly name: "llSetInventoryPermMask";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "godmode";
        readonly params: readonly [{
            readonly name: "item";
            readonly type: "string";
        }, {
            readonly name: "mask";
            readonly type: "integer";
        }, {
            readonly name: "value";
            readonly type: "integer";
        }];
    };
    readonly llSetKeyframedMotion: {
        readonly name: "llSetKeyframedMotion";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "keyframes";
            readonly type: "list";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llSetLinkAlpha: {
        readonly name: "llSetLinkAlpha";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "alpha";
            readonly type: "float";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetLinkCamera: {
        readonly name: "llSetLinkCamera";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "eye";
            readonly type: "vector";
        }, {
            readonly name: "at";
            readonly type: "vector";
        }];
    };
    readonly llSetLinkColor: {
        readonly name: "llSetLinkColor";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "color";
            readonly type: "vector";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetLinkMedia: {
        readonly name: "llSetLinkMedia";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llSetLinkPrimitiveParams: {
        readonly name: "llSetLinkPrimitiveParams";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llSetLinkPrimitiveParamsFast: {
        readonly name: "llSetLinkPrimitiveParamsFast";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llSetLinkRenderMaterial: {
        readonly name: "llSetLinkRenderMaterial";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "material";
            readonly type: "string";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetLinkSitFlags: {
        readonly name: "llSetLinkSitFlags";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "flags";
            readonly type: "integer";
        }];
    };
    readonly llSetLinkTexture: {
        readonly name: "llSetLinkTexture";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "linknumber";
            readonly type: "integer";
        }, {
            readonly name: "texture";
            readonly type: "string";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetLinkTextureAnim: {
        readonly name: "llSetLinkTextureAnim";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "link";
            readonly type: "integer";
        }, {
            readonly name: "mode";
            readonly type: "integer";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }, {
            readonly name: "sizex";
            readonly type: "integer";
        }, {
            readonly name: "sizey";
            readonly type: "integer";
        }, {
            readonly name: "start";
            readonly type: "float";
        }, {
            readonly name: "length";
            readonly type: "float";
        }, {
            readonly name: "rate";
            readonly type: "float";
        }];
    };
    readonly llSetLocalRot: {
        readonly name: "llSetLocalRot";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llSetMemoryLimit: {
        readonly name: "llSetMemoryLimit";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "limit";
            readonly type: "integer";
        }];
    };
    readonly llSetObjectDesc: {
        readonly name: "llSetObjectDesc";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "desc";
            readonly type: "string";
        }];
    };
    readonly llSetObjectName: {
        readonly name: "llSetObjectName";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }];
    };
    readonly llSetObjectPermMask: {
        readonly name: "llSetObjectPermMask";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "godmode";
        readonly params: readonly [{
            readonly name: "mask";
            readonly type: "integer";
        }, {
            readonly name: "value";
            readonly type: "integer";
        }];
    };
    readonly llSetParcelMusicURL: {
        readonly name: "llSetParcelMusicURL";
        readonly returnType: "void";
        readonly delay: 2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "url";
            readonly type: "string";
        }];
    };
    readonly llSetPayPrice: {
        readonly name: "llSetPayPrice";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "price";
            readonly type: "integer";
        }, {
            readonly name: "quick_pay_buttons";
            readonly type: "list";
        }];
    };
    readonly llSetPhysicsMaterial: {
        readonly name: "llSetPhysicsMaterial";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "flags";
            readonly type: "integer";
        }, {
            readonly name: "gravity_multiplier";
            readonly type: "float";
        }, {
            readonly name: "restitution";
            readonly type: "float";
        }, {
            readonly name: "friction";
            readonly type: "float";
        }, {
            readonly name: "density";
            readonly type: "float";
        }];
    };
    readonly llSetPos: {
        readonly name: "llSetPos";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llSetPrimMediaParams: {
        readonly name: "llSetPrimMediaParams";
        readonly returnType: "integer";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "face";
            readonly type: "integer";
        }, {
            readonly name: "params";
            readonly type: "list";
        }];
    };
    readonly llSetPrimURL: {
        readonly name: "llSetPrimURL";
        readonly returnType: "void";
        readonly delay: 20;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "url";
            readonly type: "string";
        }];
    };
    readonly llSetPrimitiveParams: {
        readonly name: "llSetPrimitiveParams";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rules";
            readonly type: "list";
        }];
    };
    readonly llSetRegionPos: {
        readonly name: "llSetRegionPos";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llSetRemoteScriptAccessPin: {
        readonly name: "llSetRemoteScriptAccessPin";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pin";
            readonly type: "integer";
        }];
    };
    readonly llSetRenderMaterial: {
        readonly name: "llSetRenderMaterial";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "material";
            readonly type: "string";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetRot: {
        readonly name: "llSetRot";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llSetScale: {
        readonly name: "llSetScale";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "scale";
            readonly type: "vector";
        }];
    };
    readonly llSetScriptState: {
        readonly name: "llSetScriptState";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "run";
            readonly type: "integer";
        }];
    };
    readonly llSetSitText: {
        readonly name: "llSetSitText";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "text";
            readonly type: "string";
        }];
    };
    readonly llSetSoundQueueing: {
        readonly name: "llSetSoundQueueing";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "queue";
            readonly type: "integer";
        }];
    };
    readonly llSetSoundRadius: {
        readonly name: "llSetSoundRadius";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "radius";
            readonly type: "float";
        }];
    };
    readonly llSetStatus: {
        readonly name: "llSetStatus";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "status";
            readonly type: "integer";
        }, {
            readonly name: "value";
            readonly type: "integer";
        }];
    };
    readonly llSetText: {
        readonly name: "llSetText";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "text";
            readonly type: "string";
        }, {
            readonly name: "color";
            readonly type: "vector";
        }, {
            readonly name: "alpha";
            readonly type: "float";
        }];
    };
    readonly llSetTexture: {
        readonly name: "llSetTexture";
        readonly returnType: "void";
        readonly delay: 0.2;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "texture";
            readonly type: "string";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }];
    };
    readonly llSetTextureAnim: {
        readonly name: "llSetTextureAnim";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "mode";
            readonly type: "integer";
        }, {
            readonly name: "face";
            readonly type: "integer";
        }, {
            readonly name: "sizex";
            readonly type: "integer";
        }, {
            readonly name: "sizey";
            readonly type: "integer";
        }, {
            readonly name: "start";
            readonly type: "float";
        }, {
            readonly name: "length";
            readonly type: "float";
        }, {
            readonly name: "rate";
            readonly type: "float";
        }];
    };
    readonly llSetTimerEvent: {
        readonly name: "llSetTimerEvent";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sec";
            readonly type: "float";
        }];
    };
    readonly llSetTorque: {
        readonly name: "llSetTorque";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "torque";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llSetTouchText: {
        readonly name: "llSetTouchText";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "text";
            readonly type: "string";
        }];
    };
    readonly llSetVehicleFlags: {
        readonly name: "llSetVehicleFlags";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "flags";
            readonly type: "integer";
        }];
    };
    readonly llSetVehicleFloatParam: {
        readonly name: "llSetVehicleFloatParam";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "param";
            readonly type: "integer";
        }, {
            readonly name: "value";
            readonly type: "float";
        }];
    };
    readonly llSetVehicleRotationParam: {
        readonly name: "llSetVehicleRotationParam";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "param";
            readonly type: "integer";
        }, {
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llSetVehicleType: {
        readonly name: "llSetVehicleType";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "type";
            readonly type: "integer";
        }];
    };
    readonly llSetVehicleVectorParam: {
        readonly name: "llSetVehicleVectorParam";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "param";
            readonly type: "integer";
        }, {
            readonly name: "vec";
            readonly type: "vector";
        }];
    };
    readonly llSetVelocity: {
        readonly name: "llSetVelocity";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "velocity";
            readonly type: "vector";
        }, {
            readonly name: "local";
            readonly type: "integer";
        }];
    };
    readonly llShout: {
        readonly name: "llShout";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llSignRSA: {
        readonly name: "llSignRSA";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "private_key";
            readonly type: "string";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }, {
            readonly name: "algorithm";
            readonly type: "string";
        }];
    };
    readonly llSin: {
        readonly name: "llSin";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "theta";
            readonly type: "float";
        }];
    };
    readonly llSitOnLink: {
        readonly name: "llSitOnLink";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent_id";
            readonly type: "key";
        }, {
            readonly name: "link";
            readonly type: "integer";
        }];
    };
    readonly llSitTarget: {
        readonly name: "llSitTarget";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }, {
            readonly name: "rot";
            readonly type: "rotation";
        }];
    };
    readonly llSleep: {
        readonly name: "llSleep";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sec";
            readonly type: "float";
        }];
    };
    readonly llSound: {
        readonly name: "llSound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }, {
            readonly name: "queue";
            readonly type: "integer";
        }, {
            readonly name: "loop";
            readonly type: "integer";
        }];
    };
    readonly llSoundPreload: {
        readonly name: "llSoundPreload";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }];
    };
    readonly llSqrt: {
        readonly name: "llSqrt";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "val";
            readonly type: "float";
        }];
    };
    readonly llStartAnimation: {
        readonly name: "llStartAnimation";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim";
            readonly type: "string";
        }];
    };
    readonly llStartObjectAnimation: {
        readonly name: "llStartObjectAnimation";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim";
            readonly type: "string";
        }];
    };
    readonly llStopAnimation: {
        readonly name: "llStopAnimation";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim";
            readonly type: "string";
        }];
    };
    readonly llStopHover: {
        readonly name: "llStopHover";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llStopLookAt: {
        readonly name: "llStopLookAt";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llStopMoveToTarget: {
        readonly name: "llStopMoveToTarget";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llStopObjectAnimation: {
        readonly name: "llStopObjectAnimation";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "anim";
            readonly type: "string";
        }];
    };
    readonly llStopPointAt: {
        readonly name: "llStopPointAt";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [];
    };
    readonly llStopSound: {
        readonly name: "llStopSound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [];
    };
    readonly llStringLength: {
        readonly name: "llStringLength";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "str";
            readonly type: "string";
        }];
    };
    readonly llStringToBase64: {
        readonly name: "llStringToBase64";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "str";
            readonly type: "string";
        }];
    };
    readonly llStringTrim: {
        readonly name: "llStringTrim";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }, {
            readonly name: "trim_type";
            readonly type: "integer";
        }];
    };
    readonly llSubStringIndex: {
        readonly name: "llSubStringIndex";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "source";
            readonly type: "string";
        }, {
            readonly name: "pattern";
            readonly type: "string";
        }];
    };
    readonly llTakeCamera: {
        readonly name: "llTakeCamera";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "unimplemented";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }];
    };
    readonly llTakeControls: {
        readonly name: "llTakeControls";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "controls";
            readonly type: "integer";
        }, {
            readonly name: "accept";
            readonly type: "integer";
        }, {
            readonly name: "pass_on";
            readonly type: "integer";
        }];
    };
    readonly llTan: {
        readonly name: "llTan";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "theta";
            readonly type: "float";
        }];
    };
    readonly llTarget: {
        readonly name: "llTarget";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "position";
            readonly type: "vector";
        }, {
            readonly name: "range";
            readonly type: "float";
        }];
    };
    readonly llTargetOmega: {
        readonly name: "llTargetOmega";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "axis";
            readonly type: "vector";
        }, {
            readonly name: "spinrate";
            readonly type: "float";
        }, {
            readonly name: "gain";
            readonly type: "float";
        }];
    };
    readonly llTargetRemove: {
        readonly name: "llTargetRemove";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "number";
            readonly type: "integer";
        }];
    };
    readonly llTargetedEmail: {
        readonly name: "llTargetedEmail";
        readonly returnType: "void";
        readonly delay: 20;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "target";
            readonly type: "integer";
        }, {
            readonly name: "subject";
            readonly type: "string";
        }, {
            readonly name: "message";
            readonly type: "string";
        }];
    };
    readonly llTeleportAgent: {
        readonly name: "llTeleportAgent";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }, {
            readonly name: "landmark";
            readonly type: "string";
        }, {
            readonly name: "position";
            readonly type: "vector";
        }, {
            readonly name: "look_at";
            readonly type: "vector";
        }];
    };
    readonly llTeleportAgentGlobalCoords: {
        readonly name: "llTeleportAgentGlobalCoords";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "global_coordinates";
            readonly type: "vector";
        }, {
            readonly name: "region_coordinates";
            readonly type: "vector";
        }, {
            readonly name: "look_at";
            readonly type: "vector";
        }];
    };
    readonly llTeleportAgentHome: {
        readonly name: "llTeleportAgentHome";
        readonly returnType: "void";
        readonly delay: 5;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llTextBox: {
        readonly name: "llTextBox";
        readonly returnType: "void";
        readonly delay: 1;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "avatar";
            readonly type: "key";
        }, {
            readonly name: "message";
            readonly type: "string";
        }, {
            readonly name: "chat_channel";
            readonly type: "integer";
        }];
    };
    readonly llToLower: {
        readonly name: "llToLower";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }];
    };
    readonly llToUpper: {
        readonly name: "llToUpper";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "src";
            readonly type: "string";
        }];
    };
    readonly llTransferLindenDollars: {
        readonly name: "llTransferLindenDollars";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "destination";
            readonly type: "key";
        }, {
            readonly name: "amount";
            readonly type: "integer";
        }];
    };
    readonly llTransferOwnership: {
        readonly name: "llTransferOwnership";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "flags";
            readonly type: "integer";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llTriggerSound: {
        readonly name: "llTriggerSound";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }];
    };
    readonly llTriggerSoundLimited: {
        readonly name: "llTriggerSoundLimited";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "sound";
            readonly type: "string";
        }, {
            readonly name: "volume";
            readonly type: "float";
        }, {
            readonly name: "top_north_east";
            readonly type: "vector";
        }, {
            readonly name: "bottom_south_west";
            readonly type: "vector";
        }];
    };
    readonly llUnSit: {
        readonly name: "llUnSit";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly llUnescapeURL: {
        readonly name: "llUnescapeURL";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "url";
            readonly type: "string";
        }];
    };
    readonly llUpdateCharacter: {
        readonly name: "llUpdateCharacter";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llUpdateKeyValue: {
        readonly name: "llUpdateKeyValue";
        readonly returnType: "key";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "k";
            readonly type: "string";
        }, {
            readonly name: "v";
            readonly type: "string";
        }, {
            readonly name: "checked";
            readonly type: "integer";
        }, {
            readonly name: "original_value";
            readonly type: "string";
        }];
    };
    readonly llVecDist: {
        readonly name: "llVecDist";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "v1";
            readonly type: "vector";
        }, {
            readonly name: "v2";
            readonly type: "vector";
        }];
    };
    readonly llVecMag: {
        readonly name: "llVecMag";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "v";
            readonly type: "vector";
        }];
    };
    readonly llVecNorm: {
        readonly name: "llVecNorm";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "v";
            readonly type: "vector";
        }];
    };
    readonly llVerifyRSA: {
        readonly name: "llVerifyRSA";
        readonly returnType: "integer";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "public_key";
            readonly type: "string";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }, {
            readonly name: "signature";
            readonly type: "string";
        }, {
            readonly name: "algorithm";
            readonly type: "string";
        }];
    };
    readonly llVolumeDetect: {
        readonly name: "llVolumeDetect";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "detect";
            readonly type: "integer";
        }];
    };
    readonly llWanderWithin: {
        readonly name: "llWanderWithin";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "center";
            readonly type: "vector";
        }, {
            readonly name: "radius";
            readonly type: "vector";
        }, {
            readonly name: "options";
            readonly type: "list";
        }];
    };
    readonly llWater: {
        readonly name: "llWater";
        readonly returnType: "float";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llWhisper: {
        readonly name: "llWhisper";
        readonly returnType: "void";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "msg";
            readonly type: "string";
        }];
    };
    readonly llWind: {
        readonly name: "llWind";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "offset";
            readonly type: "vector";
        }];
    };
    readonly llWorldPosToHUD: {
        readonly name: "llWorldPosToHUD";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly llXorBase64: {
        readonly name: "llXorBase64";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "str1";
            readonly type: "string";
        }, {
            readonly name: "str2";
            readonly type: "string";
        }];
    };
    readonly llXorBase64Strings: {
        readonly name: "llXorBase64Strings";
        readonly returnType: "string";
        readonly delay: 0.3;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "str1";
            readonly type: "string";
        }, {
            readonly name: "str2";
            readonly type: "string";
        }];
    };
    readonly llXorBase64StringsCorrect: {
        readonly name: "llXorBase64StringsCorrect";
        readonly returnType: "string";
        readonly delay: 0;
        readonly status: "deprecated";
        readonly params: readonly [{
            readonly name: "str1";
            readonly type: "string";
        }, {
            readonly name: "str2";
            readonly type: "string";
        }];
    };
    readonly llsRGB2Linear: {
        readonly name: "llsRGB2Linear";
        readonly returnType: "vector";
        readonly delay: 0;
        readonly status: "normal";
        readonly params: readonly [{
            readonly name: "srgb";
            readonly type: "vector";
        }];
    };
};
type BuiltinName = keyof typeof BUILTIN_SPECS;

/**
 * Virtual clock + event queue.
 *
 * The clock is the only source of "time" in the VM. Tests advance it
 * explicitly (`vm.advanceTime` / `linkset.advanceTime`); LSL scripts advance
 * it by calling `llSleep` or `llSetTimerEvent`. Real wall-clock time is
 * never read.
 *
 * The queue is **linkset-wide**: every script in the linkset shares one
 * `now` and one event queue. Each queued event carries a `target: Script`
 * — the script whose handler will run when the event fires. Per-script
 * state (timer interval, llGetTime reference) lives on `ScriptClockView`,
 * a thin facade exposed to builtins as `ctx.state.clock`.
 */

interface QueuedEvent {
    /** Virtual ms timestamp at which this event becomes ready to fire. */
    readonly at: number;
    /** Script whose handler is invoked when the event fires. */
    readonly target: Script;
    readonly event: string;
    readonly payload: Record<string, unknown>;
}
/** Linkset-wide clock. One instance per Linkset. */
declare class LinksetClock {
    /** Virtual milliseconds since linkset construction. Strictly monotonic. */
    now: number;
    private readonly queue;
    /** Schedule a one-shot event on `target`'s handler at virtual time `at`. */
    schedule(target: Script, at: number, event: string, payload?: Record<string, unknown>): void;
    /** Move the clock forward unconditionally; does not drain queues. */
    advance(ms: number): void;
    /**
     * Pop and return the next due event (`at <= now`) considering all queued
     * one-shots and every script's recurring timer. Returns `null` when no
     * event is ready.
     *
     * Recurring timers fire once per script per interval; their next fire
     * timestamp is advanced by `at + interval` (not `now + interval`) so that
     * long advances catch up on every missed fire.
     */
    takeNextDue(scripts: ReadonlyArray<Script>): QueuedEvent | null;
    /** Snapshot of the pending one-shot queue. Read-only; for inspection/tests. */
    pendingEvents(): readonly QueuedEvent[];
    /** Remove every queued event whose target is `script`. Used on reset. */
    purgeTarget(script: Script): void;
}
/**
 * Per-script clock facade. Builtins read `ctx.state.clock` and call
 * `.schedule()` / `.setTimer()` / `.elapsedSeconds()` against this view; it
 * forwards shared state to the linkset and keeps per-script state local.
 */
declare class ScriptClockView {
    private readonly linksetClock;
    private readonly self;
    /** Reference time for `llGetTime`/`llResetTime` (virtual ms). */
    timeReferenceMs: number;
    /** Recurring timer interval in ms; 0 = no timer. */
    timerIntervalMs: number;
    /** Virtual time at which the next timer event fires. */
    timerNextFireMs: number;
    constructor(linksetClock: LinksetClock, self: () => Script);
    get now(): number;
    /** Schedule a one-shot event on this script. */
    schedule(at: number, event: string, payload?: Record<string, unknown>): void;
    /** Schedule a one-shot event on a specific script. */
    scheduleOn(target: Script, at: number, event: string, payload?: Record<string, unknown>): void;
    cancelTimer(): void;
    setTimer(intervalMs: number): void;
    /** Advances the linkset clock — used by `llSleep`. */
    advance(ms: number): void;
    elapsedSeconds(): number;
    resetReference(): void;
}

/**
 * Tiny seeded PRNG (mulberry32) — small, fast, deterministic.
 * Used for `llFrand`, `llGenerateKey`, and any other LSL function whose
 * output we want to be repeatable across test runs.
 */
declare class Mulberry32 {
    private state;
    constructor(seed: number);
    /** Next float in [0, 1). */
    next(): number;
    /** Float in [0, max). */
    nextFloat(max: number): number;
    /** Integer in [0, max). */
    nextInt(max: number): number;
}

/**
 * LSL inventory item types. Numeric values come straight from the kwdb
 * INVENTORY_* constants. MESH (22) has no kwdb constant.
 */
declare const InventoryType: {
    readonly TEXTURE: number;
    readonly SOUND: number;
    readonly LANDMARK: number;
    readonly CLOTHING: number;
    readonly OBJECT: number;
    readonly NOTECARD: number;
    readonly SCRIPT: number;
    readonly BODYPART: number;
    readonly ANIMATION: number;
    readonly GESTURE: number;
    readonly MESH: 22;
    readonly SETTING: number;
    readonly MATERIAL: number;
};
type InventoryTypeValue = (typeof InventoryType)[keyof typeof InventoryType];
/** Permission mask slots passed to llGetInventoryPermMask. */
interface PermMask {
    readonly base: number;
    readonly owner: number;
    readonly group: number;
    readonly everyone: number;
    readonly next: number;
}
/**
 * A single item in a prim's inventory. For scripts, `script` references the
 * `Script` instance; for notecards, `notecardLines` carries the text body.
 * Other types are passive metadata.
 */
interface InventoryItem {
    name: string;
    type: InventoryTypeValue;
    key: string;
    creator: string;
    description: string;
    /** Virtual ms timestamp (relative to the linkset clock) when added. */
    acquireTimeMs: number;
    permMask: PermMask;
    /** Set when type === INVENTORY_SCRIPT. */
    script?: Script;
    /** Set when type === INVENTORY_NOTECARD. */
    notecardLines?: ReadonlyArray<string>;
}
declare function makeInventoryItem(partial: Partial<InventoryItem> & {
    name: string;
    type: InventoryTypeValue;
}): InventoryItem;

/**
 * Backing store for the PRIM_* family of llSetPrimitiveParams /
 * llGetPrimitiveParams values. The full wiki surface is modeled here so
 * that the seam in `Prim` (`getPrimParam` / `setPrimParam`) is the single
 * place where every PRIM_* rule is interpreted, whether the caller is a
 * direct llSetPrimitiveParams or one of the alternative accessors
 * (llSetPos, llSetColor, llSitTarget, …).
 */
interface PrimParams {
    position: Vector;
    rotation: Rotation;
    size: Vector;
    /** Per-face slots. LSL uses face index `ALL_SIDES = -1` to mean "every face". */
    faces: PrimFace[];
    pointLight: {
        enabled: boolean;
        color: Vector;
        intensity: number;
        radius: number;
        falloff: number;
    };
    /** Legacy mirror of `faces[i].glow`. Kept for direct field access. */
    glow: number[];
    omega: {
        axis: Vector;
        spinrate: number;
        gain: number;
    };
    physicsShapeType: number;
    flexible: {
        enabled: boolean;
        softness: number;
        gravity: number;
        friction: number;
        wind: number;
        tension: number;
        force: Vector;
    };
    sculpt: {
        textureKey: string;
        type: number;
    };
    slice: Vector;
    shape: PrimShape;
    material: number;
    tempOnRez: boolean;
    castShadows: boolean;
    allowUnsit: boolean;
    scriptedSitOnly: boolean;
    sitTarget: {
        enabled: boolean;
        offset: Vector;
        rotation: Rotation;
    };
    sitFlags: number;
    projector: {
        texture: string;
        fov: number;
        focus: number;
        ambiance: number;
    };
    clickAction: number;
    damage: {
        amount: number;
        type: number;
    };
    health: number;
    reflectionProbe: {
        enabled: boolean;
        ambiance: number;
        clipDistance: number;
        flags: number;
    };
    physicsMaterial: {
        gravityMultiplier: number;
        restitution: number;
        friction: number;
        density: number;
    };
    textureAnim: {
        mode: number;
        face: number;
        sizex: number;
        sizey: number;
        start: number;
        length: number;
        rate: number;
    };
    passCollisions: number;
    passTouches: number;
}
interface PrimFaceMaterial {
    texture: string;
    textureRepeats: Vector;
    textureOffsets: Vector;
    textureRotation: number;
}
interface PrimFace {
    texture: string;
    textureRepeats: Vector;
    textureOffsets: Vector;
    textureRotation: number;
    color: Vector;
    alpha: number;
    bumpShiny: {
        shiny: number;
        bump: number;
    };
    fullBright: boolean;
    glow: number;
    texgen: number;
    renderMaterial: string;
    normal: PrimFaceMaterial;
    specular: PrimFaceMaterial & {
        color: Vector;
        glossiness: number;
        environment: number;
    };
    alphaMode: {
        mode: number;
        cutoff: number;
    };
    gltf: {
        baseColor: PrimFaceMaterial & {
            color: Vector;
            alpha: number;
            alphaMode: number;
            alphaCutoff: number;
            doubleSided: number;
        };
        normal: PrimFaceMaterial;
        metallicRoughness: PrimFaceMaterial & {
            metallic: number;
            roughness: number;
        };
        emissive: PrimFaceMaterial & {
            tint: Vector;
        };
    };
}
/**
 * Typed-literal aliases for the kwdb PRIM_TYPE_* constants. The
 * generated module exports them as `: number` so TS can't narrow on
 * them; we re-pin them to their literal values here. The `as` assertions
 * are runtime-asserted below so a future kwdb renumber would surface as
 * a load-time failure rather than silent corruption.
 */
declare const SHAPE_BOX: 0;
declare const SHAPE_CYLINDER: 1;
declare const SHAPE_PRISM: 2;
declare const SHAPE_SPHERE: 3;
declare const SHAPE_TORUS: 4;
declare const SHAPE_TUBE: 5;
declare const SHAPE_RING: 6;
declare const SHAPE_SCULPT: 7;
type PrimShape = {
    kind: typeof SHAPE_BOX | typeof SHAPE_CYLINDER | typeof SHAPE_PRISM;
    hole: number;
    cut: Vector;
    hollow: number;
    twist: Vector;
    topSize: Vector;
    topShear: Vector;
} | {
    kind: typeof SHAPE_SPHERE;
    hole: number;
    cut: Vector;
    hollow: number;
    twist: Vector;
    dimple: Vector;
} | {
    kind: typeof SHAPE_TORUS | typeof SHAPE_TUBE | typeof SHAPE_RING;
    hole: number;
    cut: Vector;
    hollow: number;
    twist: Vector;
    holeSize: Vector;
    topShear: Vector;
    advancedCut: Vector;
    taper: Vector;
    revolutions: number;
    radiusOffset: number;
    skew: number;
} | {
    kind: typeof SHAPE_SCULPT;
    map: string;
    type: number;
};

/** @deprecated */ declare const ATTACH_LPEC: number;
/** @deprecated */ declare const ATTACH_RPEC: number;
/** @deprecated */ declare const DATA_RATING: number;
/** @deprecated */ declare const LAND_LARGE_BRUSH: number;
/** @deprecated */ declare const LAND_MEDIUM_BRUSH: number;
/** @deprecated */ declare const LAND_SMALL_BRUSH: number;
/** @deprecated */ declare const PRIM_MATERIAL_LIGHT: number;
/** @deprecated */ declare const PSYS_SRC_INNERANGLE: number;
/** @deprecated */ declare const PSYS_SRC_OUTERANGLE: number;
/** @deprecated */ declare const REMOTE_DATA_CHANNEL: number;
/** @deprecated */ declare const REMOTE_DATA_REPLY: number;
/** @deprecated */ declare const REMOTE_DATA_REQUEST: number;
/** @deprecated */ declare const SKY_TRACKS: number;
/** @deprecated */ declare const VEHICLE_FLAG_NO_FLY_UP: number;
declare const ACTIVE: number;
declare const AGENT: number;
declare const AGENT_ALWAYS_RUN: number;
declare const AGENT_ATTACHMENTS: number;
declare const AGENT_AUTOMATED: number;
declare const AGENT_AUTOPILOT: number;
declare const AGENT_AWAY: number;
declare const AGENT_BUSY: number;
declare const AGENT_BY_LEGACY_NAME: number;
declare const AGENT_BY_USERNAME: number;
declare const AGENT_CROUCHING: number;
declare const AGENT_FLOATING_VIA_SCRIPTED_ATTACHMENT: number;
declare const AGENT_FLYING: number;
declare const AGENT_IN_AIR: number;
declare const AGENT_LIST_PARCEL: number;
declare const AGENT_LIST_PARCEL_OWNER: number;
declare const AGENT_LIST_REGION: number;
declare const AGENT_MOUSELOOK: number;
declare const AGENT_ON_OBJECT: number;
declare const AGENT_SCRIPTED: number;
declare const AGENT_SITTING: number;
declare const AGENT_TYPING: number;
declare const AGENT_WALKING: number;
declare const ALL_SIDES: number;
declare const ANIM_ON: number;
declare const ATTACH_ANY_HUD: number;
declare const ATTACH_AVATAR_CENTER: number;
declare const ATTACH_BACK: number;
declare const ATTACH_BELLY: number;
declare const ATTACH_CHEST: number;
declare const ATTACH_CHIN: number;
declare const ATTACH_FACE_JAW: number;
declare const ATTACH_FACE_LEAR: number;
declare const ATTACH_FACE_LEYE: number;
declare const ATTACH_FACE_REAR: number;
declare const ATTACH_FACE_REYE: number;
declare const ATTACH_FACE_TONGUE: number;
declare const ATTACH_GROIN: number;
declare const ATTACH_HEAD: number;
declare const ATTACH_HIND_LFOOT: number;
declare const ATTACH_HIND_RFOOT: number;
declare const ATTACH_HUD_BOTTOM: number;
declare const ATTACH_HUD_BOTTOM_LEFT: number;
declare const ATTACH_HUD_BOTTOM_RIGHT: number;
declare const ATTACH_HUD_CENTER_1: number;
declare const ATTACH_HUD_CENTER_2: number;
declare const ATTACH_HUD_TOP_CENTER: number;
declare const ATTACH_HUD_TOP_LEFT: number;
declare const ATTACH_HUD_TOP_RIGHT: number;
declare const ATTACH_LEAR: number;
declare const ATTACH_LEFT_PEC: number;
declare const ATTACH_LEYE: number;
declare const ATTACH_LFOOT: number;
declare const ATTACH_LHAND: number;
declare const ATTACH_LHAND_RING1: number;
declare const ATTACH_LHIP: number;
declare const ATTACH_LLARM: number;
declare const ATTACH_LLLEG: number;
declare const ATTACH_LSHOULDER: number;
declare const ATTACH_LUARM: number;
declare const ATTACH_LULEG: number;
declare const ATTACH_LWING: number;
declare const ATTACH_MOUTH: number;
declare const ATTACH_NECK: number;
declare const ATTACH_NOSE: number;
declare const ATTACH_PELVIS: number;
declare const ATTACH_REAR: number;
declare const ATTACH_REYE: number;
declare const ATTACH_RFOOT: number;
declare const ATTACH_RHAND: number;
declare const ATTACH_RHAND_RING1: number;
declare const ATTACH_RHIP: number;
declare const ATTACH_RIGHT_PEC: number;
declare const ATTACH_RLARM: number;
declare const ATTACH_RLLEG: number;
declare const ATTACH_RSHOULDER: number;
declare const ATTACH_RUARM: number;
declare const ATTACH_RULEG: number;
declare const ATTACH_RWING: number;
declare const ATTACH_TAIL_BASE: number;
declare const ATTACH_TAIL_TIP: number;
declare const AVOID_CHARACTERS: number;
declare const AVOID_DYNAMIC_OBSTACLES: number;
declare const AVOID_NONE: number;
declare const BEACON_MAP: number;
declare const CAMERA_ACTIVE: number;
declare const CAMERA_BEHINDNESS_ANGLE: number;
declare const CAMERA_BEHINDNESS_LAG: number;
declare const CAMERA_DISTANCE: number;
declare const CAMERA_FOCUS: number;
declare const CAMERA_FOCUS_LAG: number;
declare const CAMERA_FOCUS_LOCKED: number;
declare const CAMERA_FOCUS_OFFSET: number;
declare const CAMERA_FOCUS_THRESHOLD: number;
declare const CAMERA_PITCH: number;
declare const CAMERA_POSITION: number;
declare const CAMERA_POSITION_LAG: number;
declare const CAMERA_POSITION_LOCKED: number;
declare const CAMERA_POSITION_THRESHOLD: number;
declare const CHANGED_ALLOWED_DROP: number;
declare const CHANGED_COLOR: number;
declare const CHANGED_INVENTORY: number;
declare const CHANGED_LINK: number;
declare const CHANGED_MEDIA: number;
declare const CHANGED_OWNER: number;
declare const CHANGED_REGION: number;
declare const CHANGED_REGION_START: number;
declare const CHANGED_RENDER_MATERIAL: number;
declare const CHANGED_SCALE: number;
declare const CHANGED_SHAPE: number;
declare const CHANGED_TELEPORT: number;
declare const CHANGED_TEXTURE: number;
declare const CHARACTER_ACCOUNT_FOR_SKIPPED_FRAMES: number;
declare const CHARACTER_AVOIDANCE_MODE: number;
declare const CHARACTER_CMD_JUMP: number;
declare const CHARACTER_CMD_SMOOTH_STOP: number;
declare const CHARACTER_CMD_STOP: number;
declare const CHARACTER_DESIRED_SPEED: number;
declare const CHARACTER_DESIRED_TURN_SPEED: number;
declare const CHARACTER_LENGTH: number;
declare const CHARACTER_MAX_ACCEL: number;
declare const CHARACTER_MAX_DECEL: number;
declare const CHARACTER_MAX_SPEED: number;
declare const CHARACTER_MAX_TURN_RADIUS: number;
declare const CHARACTER_ORIENTATION: number;
declare const CHARACTER_RADIUS: number;
declare const CHARACTER_STAY_WITHIN_PARCEL: number;
declare const CHARACTER_TYPE: number;
declare const CHARACTER_TYPE_A: number;
declare const CHARACTER_TYPE_B: number;
declare const CHARACTER_TYPE_C: number;
declare const CHARACTER_TYPE_D: number;
declare const CHARACTER_TYPE_NONE: number;
declare const CLICK_ACTION_BUY: number;
declare const CLICK_ACTION_DISABLED: number;
declare const CLICK_ACTION_IGNORE: number;
declare const CLICK_ACTION_NONE: number;
declare const CLICK_ACTION_OPEN: number;
declare const CLICK_ACTION_OPEN_MEDIA: number;
declare const CLICK_ACTION_PAY: number;
declare const CLICK_ACTION_PLAY: number;
declare const CLICK_ACTION_SIT: number;
declare const CLICK_ACTION_TOUCH: number;
declare const CLICK_ACTION_ZOOM: number;
declare const COMBAT_CHANNEL: number;
declare const COMBAT_LOG_ID: string;
declare const CONTENT_TYPE_ATOM: number;
declare const CONTENT_TYPE_FORM: number;
declare const CONTENT_TYPE_HTML: number;
declare const CONTENT_TYPE_JSON: number;
declare const CONTENT_TYPE_LLSD: number;
declare const CONTENT_TYPE_RSS: number;
declare const CONTENT_TYPE_TEXT: number;
declare const CONTENT_TYPE_XHTML: number;
declare const CONTENT_TYPE_XML: number;
declare const CONTROL_BACK: number;
declare const CONTROL_DOWN: number;
declare const CONTROL_FWD: number;
declare const CONTROL_LBUTTON: number;
declare const CONTROL_LEFT: number;
declare const CONTROL_ML_LBUTTON: number;
declare const CONTROL_RIGHT: number;
declare const CONTROL_ROT_LEFT: number;
declare const CONTROL_ROT_RIGHT: number;
declare const CONTROL_UP: number;
declare const DAMAGEABLE: number;
declare const DAMAGE_TYPE_ACID: number;
declare const DAMAGE_TYPE_BLUDGEONING: number;
declare const DAMAGE_TYPE_COLD: number;
declare const DAMAGE_TYPE_ELECTRIC: number;
declare const DAMAGE_TYPE_EMOTIONAL: number;
declare const DAMAGE_TYPE_FIRE: number;
declare const DAMAGE_TYPE_FORCE: number;
declare const DAMAGE_TYPE_GENERIC: number;
declare const DAMAGE_TYPE_IMPACT: number;
declare const DAMAGE_TYPE_NECROTIC: number;
declare const DAMAGE_TYPE_PIERCING: number;
declare const DAMAGE_TYPE_POISON: number;
declare const DAMAGE_TYPE_PSYCHIC: number;
declare const DAMAGE_TYPE_RADIANT: number;
declare const DAMAGE_TYPE_SLASHING: number;
declare const DAMAGE_TYPE_SONIC: number;
declare const DATA_BORN: number;
declare const DATA_NAME: number;
declare const DATA_ONLINE: number;
declare const DATA_PAYINFO: number;
declare const DATA_SIM_POS: number;
declare const DATA_SIM_RATING: number;
declare const DATA_SIM_STATUS: number;
declare const DEBUG_CHANNEL: number;
declare const DEG_TO_RAD: number;
declare const DENSITY: number;
declare const DEREZ_DIE: number;
declare const DEREZ_MAKE_TEMP: number;
declare const ENVIRONMENT_DAYINFO: number;
declare const ENV_INVALID_AGENT: number;
declare const ENV_INVALID_RULE: number;
declare const ENV_NOT_EXPERIENCE: number;
declare const ENV_NO_ENVIRONMENT: number;
declare const ENV_NO_EXPERIENCE_LAND: number;
declare const ENV_NO_EXPERIENCE_PERMISSION: number;
declare const ENV_NO_PERMISSIONS: number;
declare const ENV_THROTTLE: number;
declare const ENV_VALIDATION_FAIL: number;
declare const EOF: string;
declare const ERR_GENERIC: number;
declare const ERR_MALFORMED_PARAMS: number;
declare const ERR_PARCEL_PERMISSIONS: number;
declare const ERR_RUNTIME_PERMISSIONS: number;
declare const ERR_THROTTLED: number;
declare const ESTATE_ACCESS_ALLOWED_AGENT_ADD: number;
declare const ESTATE_ACCESS_ALLOWED_AGENT_REMOVE: number;
declare const ESTATE_ACCESS_ALLOWED_GROUP_ADD: number;
declare const ESTATE_ACCESS_ALLOWED_GROUP_REMOVE: number;
declare const ESTATE_ACCESS_BANNED_AGENT_ADD: number;
declare const ESTATE_ACCESS_BANNED_AGENT_REMOVE: number;
declare const FALSE: number;
declare const FILTER_FLAGS: number;
declare const FILTER_FLAG_HUDS: number;
declare const FILTER_INCLUDE: number;
declare const FORCE_DIRECT_PATH: number;
declare const FRICTION: number;
declare const GAME_CONTROL_AXIS_LEFTX: number;
declare const GAME_CONTROL_AXIS_LEFTY: number;
declare const GAME_CONTROL_AXIS_RIGHTX: number;
declare const GAME_CONTROL_AXIS_RIGHTY: number;
declare const GAME_CONTROL_AXIS_TRIGGERLEFT: number;
declare const GAME_CONTROL_AXIS_TRIGGERRIGHT: number;
declare const GAME_CONTROL_BUTTON_A: number;
declare const GAME_CONTROL_BUTTON_B: number;
declare const GAME_CONTROL_BUTTON_BACK: number;
declare const GAME_CONTROL_BUTTON_DPAD_DOWN: number;
declare const GAME_CONTROL_BUTTON_DPAD_LEFT: number;
declare const GAME_CONTROL_BUTTON_DPAD_RIGHT: number;
declare const GAME_CONTROL_BUTTON_DPAD_UP: number;
declare const GAME_CONTROL_BUTTON_GUIDE: number;
declare const GAME_CONTROL_BUTTON_LEFTSHOULDER: number;
declare const GAME_CONTROL_BUTTON_LEFTSTICK: number;
declare const GAME_CONTROL_BUTTON_MISC1: number;
declare const GAME_CONTROL_BUTTON_PADDLE1: number;
declare const GAME_CONTROL_BUTTON_PADDLE2: number;
declare const GAME_CONTROL_BUTTON_PADDLE3: number;
declare const GAME_CONTROL_BUTTON_PADDLE4: number;
declare const GAME_CONTROL_BUTTON_RIGHTSHOULDER: number;
declare const GAME_CONTROL_BUTTON_RIGHTSTICK: number;
declare const GAME_CONTROL_BUTTON_START: number;
declare const GAME_CONTROL_BUTTON_TOUCHPAD: number;
declare const GAME_CONTROL_BUTTON_X: number;
declare const GAME_CONTROL_BUTTON_Y: number;
declare const GCNP_RADIUS: number;
declare const GCNP_STATIC: number;
declare const GRAVITY_MULTIPLIER: number;
declare const HORIZONTAL: number;
declare const HTTP_ACCEPT: number;
declare const HTTP_BODY_MAXLENGTH: number;
declare const HTTP_BODY_TRUNCATED: number;
declare const HTTP_CUSTOM_HEADER: number;
declare const HTTP_EXTENDED_ERROR: number;
declare const HTTP_METHOD: number;
declare const HTTP_MIMETYPE: number;
declare const HTTP_PRAGMA_NO_CACHE: number;
declare const HTTP_USER_AGENT: number;
declare const HTTP_VERBOSE_THROTTLE: number;
declare const HTTP_VERIFY_CERT: number;
declare const IMG_USE_BAKED_AUX1: string;
declare const IMG_USE_BAKED_AUX2: string;
declare const IMG_USE_BAKED_AUX3: string;
declare const IMG_USE_BAKED_EYES: string;
declare const IMG_USE_BAKED_HAIR: string;
declare const IMG_USE_BAKED_HEAD: string;
declare const IMG_USE_BAKED_LEFTARM: string;
declare const IMG_USE_BAKED_LEFTLEG: string;
declare const IMG_USE_BAKED_LOWER: string;
declare const IMG_USE_BAKED_SKIRT: string;
declare const IMG_USE_BAKED_UPPER: string;
declare const INVENTORY_ALL: number;
declare const INVENTORY_ANIMATION: number;
declare const INVENTORY_BODYPART: number;
declare const INVENTORY_CLOTHING: number;
declare const INVENTORY_GESTURE: number;
declare const INVENTORY_LANDMARK: number;
declare const INVENTORY_MATERIAL: number;
declare const INVENTORY_NONE: number;
declare const INVENTORY_NOTECARD: number;
declare const INVENTORY_OBJECT: number;
declare const INVENTORY_SCRIPT: number;
declare const INVENTORY_SETTING: number;
declare const INVENTORY_SOUND: number;
declare const INVENTORY_TEXTURE: number;
declare const JSON_APPEND: number;
declare const JSON_ARRAY: string;
declare const JSON_DELETE: string;
declare const JSON_FALSE: string;
declare const JSON_INVALID: string;
declare const JSON_NULL: string;
declare const JSON_NUMBER: string;
declare const JSON_OBJECT: string;
declare const JSON_STRING: string;
declare const JSON_TRUE: string;
declare const KFM_CMD_PAUSE: number;
declare const KFM_CMD_PLAY: number;
declare const KFM_CMD_STOP: number;
declare const KFM_COMMAND: number;
declare const KFM_DATA: number;
declare const KFM_FORWARD: number;
declare const KFM_LOOP: number;
declare const KFM_MODE: number;
declare const KFM_PING_PONG: number;
declare const KFM_REVERSE: number;
declare const KFM_ROTATION: number;
declare const KFM_TRANSLATION: number;
declare const LAND_LEVEL: number;
declare const LAND_LOWER: number;
declare const LAND_NOISE: number;
declare const LAND_RAISE: number;
declare const LAND_REVERT: number;
declare const LAND_SMOOTH: number;
declare const LINKSETDATA_DELETE: number;
declare const LINKSETDATA_EMEMORY: number;
declare const LINKSETDATA_ENOKEY: number;
declare const LINKSETDATA_EPROTECTED: number;
declare const LINKSETDATA_MULTIDELETE: number;
declare const LINKSETDATA_NOTFOUND: number;
declare const LINKSETDATA_NOUPDATE: number;
declare const LINKSETDATA_OK: number;
declare const LINKSETDATA_RESET: number;
declare const LINKSETDATA_UPDATE: number;
declare const LINK_ALL_CHILDREN: number;
declare const LINK_ALL_OTHERS: number;
declare const LINK_ROOT: number;
declare const LINK_SET: number;
declare const LINK_THIS: number;
declare const LIST_STAT_GEOMETRIC_MEAN: number;
declare const LIST_STAT_MAX: number;
declare const LIST_STAT_MEAN: number;
declare const LIST_STAT_MEDIAN: number;
declare const LIST_STAT_MIN: number;
declare const LIST_STAT_NUM_COUNT: number;
declare const LIST_STAT_RANGE: number;
declare const LIST_STAT_STD_DEV: number;
declare const LIST_STAT_SUM: number;
declare const LIST_STAT_SUM_SQUARES: number;
declare const LOOP: number;
declare const MASK_BASE: number;
declare const MASK_EVERYONE: number;
declare const MASK_GROUP: number;
declare const MASK_NEXT: number;
declare const MASK_OWNER: number;
declare const NAK: string;
declare const OBJECT_ACCOUNT_LEVEL: number;
declare const OBJECT_ANIMATED_COUNT: number;
declare const OBJECT_ANIMATED_SLOTS_AVAILABLE: number;
declare const OBJECT_ATTACHED_POINT: number;
declare const OBJECT_ATTACHED_SLOTS_AVAILABLE: number;
declare const OBJECT_BODY_SHAPE_TYPE: number;
declare const OBJECT_CHARACTER_TIME: number;
declare const OBJECT_CLICK_ACTION: number;
declare const OBJECT_CREATION_TIME: number;
declare const OBJECT_CREATOR: number;
declare const OBJECT_DAMAGE: number;
declare const OBJECT_DAMAGE_TYPE: number;
declare const OBJECT_DESC: number;
declare const OBJECT_GROUP: number;
declare const OBJECT_GROUP_TAG: number;
declare const OBJECT_HEALTH: number;
declare const OBJECT_HOVER_HEIGHT: number;
declare const OBJECT_LAST_OWNER_ID: number;
declare const OBJECT_LINK_NUMBER: number;
declare const OBJECT_MASS: number;
declare const OBJECT_MATERIAL: number;
declare const OBJECT_NAME: number;
declare const OBJECT_OMEGA: number;
declare const OBJECT_OWNER: number;
declare const OBJECT_PATHFINDING_TYPE: number;
declare const OBJECT_PHANTOM: number;
declare const OBJECT_PHYSICS: number;
declare const OBJECT_PHYSICS_COST: number;
declare const OBJECT_POS: number;
declare const OBJECT_PRIM_COUNT: number;
declare const OBJECT_PRIM_EQUIVALENCE: number;
declare const OBJECT_RENDER_WEIGHT: number;
declare const OBJECT_RETURN_PARCEL: number;
declare const OBJECT_RETURN_PARCEL_OWNER: number;
declare const OBJECT_RETURN_REGION: number;
declare const OBJECT_REZZER_KEY: number;
declare const OBJECT_REZ_TIME: number;
declare const OBJECT_ROOT: number;
declare const OBJECT_ROT: number;
declare const OBJECT_RUNNING_SCRIPT_COUNT: number;
declare const OBJECT_SCALE: number;
declare const OBJECT_SCRIPT_MEMORY: number;
declare const OBJECT_SCRIPT_TIME: number;
declare const OBJECT_SELECT_COUNT: number;
declare const OBJECT_SERVER_COST: number;
declare const OBJECT_SIT_COUNT: number;
declare const OBJECT_STREAMING_COST: number;
declare const OBJECT_TEMP_ATTACHED: number;
declare const OBJECT_TEMP_ON_REZ: number;
declare const OBJECT_TEXT: number;
declare const OBJECT_TEXT_ALPHA: number;
declare const OBJECT_TEXT_COLOR: number;
declare const OBJECT_TOTAL_INVENTORY_COUNT: number;
declare const OBJECT_TOTAL_SCRIPT_COUNT: number;
declare const OBJECT_UNKNOWN_DETAIL: number;
declare const OBJECT_VELOCITY: number;
declare const OPT_AVATAR: number;
declare const OPT_CHARACTER: number;
declare const OPT_EXCLUSION_VOLUME: number;
declare const OPT_LEGACY_LINKSET: number;
declare const OPT_MATERIAL_VOLUME: number;
declare const OPT_OTHER: number;
declare const OPT_STATIC_OBSTACLE: number;
declare const OPT_WALKABLE: number;
declare const PARCEL_COUNT_GROUP: number;
declare const PARCEL_COUNT_OTHER: number;
declare const PARCEL_COUNT_OWNER: number;
declare const PARCEL_COUNT_SELECTED: number;
declare const PARCEL_COUNT_TEMP: number;
declare const PARCEL_COUNT_TOTAL: number;
declare const PARCEL_DETAILS_AREA: number;
declare const PARCEL_DETAILS_DESC: number;
declare const PARCEL_DETAILS_FLAGS: number;
declare const PARCEL_DETAILS_GROUP: number;
declare const PARCEL_DETAILS_ID: number;
declare const PARCEL_DETAILS_LANDING_LOOKAT: number;
declare const PARCEL_DETAILS_LANDING_POINT: number;
declare const PARCEL_DETAILS_NAME: number;
declare const PARCEL_DETAILS_OWNER: number;
declare const PARCEL_DETAILS_PRIM_CAPACITY: number;
declare const PARCEL_DETAILS_PRIM_USED: number;
declare const PARCEL_DETAILS_SCRIPT_DANGER: number;
declare const PARCEL_DETAILS_SEE_AVATARS: number;
declare const PARCEL_DETAILS_TP_ROUTING: number;
declare const PARCEL_FLAG_ALLOW_ALL_OBJECT_ENTRY: number;
declare const PARCEL_FLAG_ALLOW_CREATE_GROUP_OBJECTS: number;
declare const PARCEL_FLAG_ALLOW_CREATE_OBJECTS: number;
declare const PARCEL_FLAG_ALLOW_DAMAGE: number;
declare const PARCEL_FLAG_ALLOW_FLY: number;
declare const PARCEL_FLAG_ALLOW_GROUP_OBJECT_ENTRY: number;
declare const PARCEL_FLAG_ALLOW_GROUP_SCRIPTS: number;
declare const PARCEL_FLAG_ALLOW_LANDMARK: number;
declare const PARCEL_FLAG_ALLOW_SCRIPTS: number;
declare const PARCEL_FLAG_ALLOW_TERRAFORM: number;
declare const PARCEL_FLAG_LOCAL_SOUND_ONLY: number;
declare const PARCEL_FLAG_RESTRICT_PUSHOBJECT: number;
declare const PARCEL_FLAG_USE_ACCESS_GROUP: number;
declare const PARCEL_FLAG_USE_ACCESS_LIST: number;
declare const PARCEL_FLAG_USE_BAN_LIST: number;
declare const PARCEL_FLAG_USE_LAND_PASS_LIST: number;
declare const PARCEL_MEDIA_COMMAND_AGENT: number;
declare const PARCEL_MEDIA_COMMAND_AUTO_ALIGN: number;
declare const PARCEL_MEDIA_COMMAND_DESC: number;
declare const PARCEL_MEDIA_COMMAND_LOOP: number;
declare const PARCEL_MEDIA_COMMAND_LOOP_SET: number;
declare const PARCEL_MEDIA_COMMAND_PAUSE: number;
declare const PARCEL_MEDIA_COMMAND_PLAY: number;
declare const PARCEL_MEDIA_COMMAND_SIZE: number;
declare const PARCEL_MEDIA_COMMAND_STOP: number;
declare const PARCEL_MEDIA_COMMAND_TEXTURE: number;
declare const PARCEL_MEDIA_COMMAND_TIME: number;
declare const PARCEL_MEDIA_COMMAND_TYPE: number;
declare const PARCEL_MEDIA_COMMAND_UNLOAD: number;
declare const PARCEL_MEDIA_COMMAND_URL: number;
declare const PASSIVE: number;
declare const PASS_ALWAYS: number;
declare const PASS_IF_NOT_HANDLED: number;
declare const PASS_NEVER: number;
declare const PATROL_PAUSE_AT_WAYPOINTS: number;
declare const PAYMENT_INFO_ON_FILE: number;
declare const PAYMENT_INFO_USED: number;
declare const PAY_DEFAULT: number;
declare const PAY_HIDE: number;
declare const PERMISSION_ATTACH: number;
declare const PERMISSION_CHANGE_JOINTS: number;
declare const PERMISSION_CHANGE_LINKS: number;
declare const PERMISSION_CHANGE_PERMISSIONS: number;
declare const PERMISSION_CONTROL_CAMERA: number;
declare const PERMISSION_DEBIT: number;
declare const PERMISSION_OVERRIDE_ANIMATIONS: number;
declare const PERMISSION_RELEASE_OWNERSHIP: number;
declare const PERMISSION_REMAP_CONTROLS: number;
declare const PERMISSION_RETURN_OBJECTS: number;
declare const PERMISSION_SILENT_ESTATE_MANAGEMENT: number;
declare const PERMISSION_TAKE_CONTROLS: number;
declare const PERMISSION_TELEPORT: number;
declare const PERMISSION_TRACK_CAMERA: number;
declare const PERMISSION_TRIGGER_ANIMATION: number;
declare const PERM_ALL: number;
declare const PERM_COPY: number;
declare const PERM_MODIFY: number;
declare const PERM_MOVE: number;
declare const PERM_TRANSFER: number;
declare const PI: number;
declare const PING_PONG: number;
declare const PI_BY_TWO: number;
declare const PRIM_ALLOW_UNSIT: number;
declare const PRIM_ALPHA_MODE: number;
declare const PRIM_ALPHA_MODE_BLEND: number;
declare const PRIM_ALPHA_MODE_EMISSIVE: number;
declare const PRIM_ALPHA_MODE_MASK: number;
declare const PRIM_ALPHA_MODE_NONE: number;
declare const PRIM_BUMP_BARK: number;
declare const PRIM_BUMP_BLOBS: number;
declare const PRIM_BUMP_BRICKS: number;
declare const PRIM_BUMP_BRIGHT: number;
declare const PRIM_BUMP_CHECKER: number;
declare const PRIM_BUMP_CONCRETE: number;
declare const PRIM_BUMP_DARK: number;
declare const PRIM_BUMP_DISKS: number;
declare const PRIM_BUMP_GRAVEL: number;
declare const PRIM_BUMP_LARGETILE: number;
declare const PRIM_BUMP_NONE: number;
declare const PRIM_BUMP_SHINY: number;
declare const PRIM_BUMP_SIDING: number;
declare const PRIM_BUMP_STONE: number;
declare const PRIM_BUMP_STUCCO: number;
declare const PRIM_BUMP_SUCTION: number;
declare const PRIM_BUMP_TILE: number;
declare const PRIM_BUMP_WEAVE: number;
declare const PRIM_BUMP_WOOD: number;
declare const PRIM_CAST_SHADOWS: number;
declare const PRIM_CLICK_ACTION: number;
declare const PRIM_COLOR: number;
declare const PRIM_DAMAGE: number;
declare const PRIM_DESC: number;
declare const PRIM_FLEXIBLE: number;
declare const PRIM_FULLBRIGHT: number;
declare const PRIM_GLOW: number;
declare const PRIM_GLTF_ALPHA_MODE_BLEND: number;
declare const PRIM_GLTF_ALPHA_MODE_MASK: number;
declare const PRIM_GLTF_ALPHA_MODE_OPAQUE: number;
declare const PRIM_GLTF_BASE_COLOR: number;
declare const PRIM_GLTF_EMISSIVE: number;
declare const PRIM_GLTF_METALLIC_ROUGHNESS: number;
declare const PRIM_GLTF_NORMAL: number;
declare const PRIM_HEALTH: number;
declare const PRIM_HOLE_CIRCLE: number;
declare const PRIM_HOLE_DEFAULT: number;
declare const PRIM_HOLE_SQUARE: number;
declare const PRIM_HOLE_TRIANGLE: number;
declare const PRIM_LINK_TARGET: number;
declare const PRIM_MATERIAL: number;
declare const PRIM_MATERIAL_FLESH: number;
declare const PRIM_MATERIAL_GLASS: number;
declare const PRIM_MATERIAL_METAL: number;
declare const PRIM_MATERIAL_PLASTIC: number;
declare const PRIM_MATERIAL_RUBBER: number;
declare const PRIM_MATERIAL_STONE: number;
declare const PRIM_MATERIAL_WOOD: number;
declare const PRIM_MEDIA_ALT_IMAGE_ENABLE: number;
declare const PRIM_MEDIA_AUTO_LOOP: number;
declare const PRIM_MEDIA_AUTO_PLAY: number;
declare const PRIM_MEDIA_AUTO_SCALE: number;
declare const PRIM_MEDIA_AUTO_ZOOM: number;
declare const PRIM_MEDIA_CONTROLS: number;
declare const PRIM_MEDIA_CONTROLS_MINI: number;
declare const PRIM_MEDIA_CONTROLS_STANDARD: number;
declare const PRIM_MEDIA_CURRENT_URL: number;
declare const PRIM_MEDIA_FIRST_CLICK_INTERACT: number;
declare const PRIM_MEDIA_HEIGHT_PIXELS: number;
declare const PRIM_MEDIA_HOME_URL: number;
declare const PRIM_MEDIA_MAX_HEIGHT_PIXELS: number;
declare const PRIM_MEDIA_MAX_URL_LENGTH: number;
declare const PRIM_MEDIA_MAX_WHITELIST_COUNT: number;
declare const PRIM_MEDIA_MAX_WHITELIST_SIZE: number;
declare const PRIM_MEDIA_MAX_WIDTH_PIXELS: number;
declare const PRIM_MEDIA_PARAM_MAX: number;
declare const PRIM_MEDIA_PERMS_CONTROL: number;
declare const PRIM_MEDIA_PERMS_INTERACT: number;
declare const PRIM_MEDIA_PERM_ANYONE: number;
declare const PRIM_MEDIA_PERM_GROUP: number;
declare const PRIM_MEDIA_PERM_NONE: number;
declare const PRIM_MEDIA_PERM_OWNER: number;
declare const PRIM_MEDIA_WHITELIST: number;
declare const PRIM_MEDIA_WHITELIST_ENABLE: number;
declare const PRIM_MEDIA_WIDTH_PIXELS: number;
declare const PRIM_NAME: number;
declare const PRIM_NORMAL: number;
declare const PRIM_OMEGA: number;
declare const PRIM_PHANTOM: number;
declare const PRIM_PHYSICS: number;
declare const PRIM_PHYSICS_SHAPE_CONVEX: number;
declare const PRIM_PHYSICS_SHAPE_NONE: number;
declare const PRIM_PHYSICS_SHAPE_PRIM: number;
declare const PRIM_PHYSICS_SHAPE_TYPE: number;
declare const PRIM_POINT_LIGHT: number;
declare const PRIM_POSITION: number;
declare const PRIM_POS_LOCAL: number;
declare const PRIM_PROJECTOR: number;
declare const PRIM_REFLECTION_PROBE: number;
declare const PRIM_REFLECTION_PROBE_BOX: number;
declare const PRIM_REFLECTION_PROBE_DYNAMIC: number;
declare const PRIM_REFLECTION_PROBE_MIRROR: number;
declare const PRIM_RENDER_MATERIAL: number;
declare const PRIM_ROTATION: number;
declare const PRIM_ROT_LOCAL: number;
declare const PRIM_SCRIPTED_SIT_ONLY: number;
declare const PRIM_SCULPT_FLAG_ANIMESH: number;
declare const PRIM_SCULPT_FLAG_INVERT: number;
declare const PRIM_SCULPT_FLAG_MIRROR: number;
declare const PRIM_SCULPT_TYPE_CYLINDER: number;
declare const PRIM_SCULPT_TYPE_MASK: number;
declare const PRIM_SCULPT_TYPE_MESH: number;
declare const PRIM_SCULPT_TYPE_PLANE: number;
declare const PRIM_SCULPT_TYPE_SPHERE: number;
declare const PRIM_SCULPT_TYPE_TORUS: number;
declare const PRIM_SHINY_HIGH: number;
declare const PRIM_SHINY_LOW: number;
declare const PRIM_SHINY_MEDIUM: number;
declare const PRIM_SHINY_NONE: number;
declare const PRIM_SIT_FLAGS: number;
declare const PRIM_SIT_TARGET: number;
declare const PRIM_SIZE: number;
declare const PRIM_SLICE: number;
declare const PRIM_SPECULAR: number;
declare const PRIM_TEMP_ON_REZ: number;
declare const PRIM_TEXGEN: number;
declare const PRIM_TEXGEN_DEFAULT: number;
declare const PRIM_TEXGEN_PLANAR: number;
declare const PRIM_TEXT: number;
declare const PRIM_TEXTURE: number;
declare const PRIM_TYPE: number;
declare const PRIM_TYPE_BOX: number;
declare const PRIM_TYPE_CYLINDER: number;
declare const PRIM_TYPE_PRISM: number;
declare const PRIM_TYPE_RING: number;
declare const PRIM_TYPE_SCULPT: number;
declare const PRIM_TYPE_SPHERE: number;
declare const PRIM_TYPE_TORUS: number;
declare const PRIM_TYPE_TUBE: number;
declare const PROFILE_NONE: number;
declare const PROFILE_SCRIPT_MEMORY: number;
declare const PSYS_PART_BF_DEST_COLOR: number;
declare const PSYS_PART_BF_ONE: number;
declare const PSYS_PART_BF_ONE_MINUS_DEST_COLOR: number;
declare const PSYS_PART_BF_ONE_MINUS_SOURCE_ALPHA: number;
declare const PSYS_PART_BF_ONE_MINUS_SOURCE_COLOR: number;
declare const PSYS_PART_BF_SOURCE_ALPHA: number;
declare const PSYS_PART_BF_SOURCE_COLOR: number;
declare const PSYS_PART_BF_ZERO: number;
declare const PSYS_PART_BLEND_FUNC_DEST: number;
declare const PSYS_PART_BLEND_FUNC_SOURCE: number;
declare const PSYS_PART_BOUNCE_MASK: number;
declare const PSYS_PART_EMISSIVE_MASK: number;
declare const PSYS_PART_END_ALPHA: number;
declare const PSYS_PART_END_COLOR: number;
declare const PSYS_PART_END_GLOW: number;
declare const PSYS_PART_END_SCALE: number;
declare const PSYS_PART_FLAGS: number;
declare const PSYS_PART_FOLLOW_SRC_MASK: number;
declare const PSYS_PART_FOLLOW_VELOCITY_MASK: number;
declare const PSYS_PART_INTERP_COLOR_MASK: number;
declare const PSYS_PART_INTERP_SCALE_MASK: number;
declare const PSYS_PART_MAX_AGE: number;
declare const PSYS_PART_RIBBON_MASK: number;
declare const PSYS_PART_START_ALPHA: number;
declare const PSYS_PART_START_COLOR: number;
declare const PSYS_PART_START_GLOW: number;
declare const PSYS_PART_START_SCALE: number;
declare const PSYS_PART_TARGET_LINEAR_MASK: number;
declare const PSYS_PART_TARGET_POS_MASK: number;
declare const PSYS_PART_WIND_MASK: number;
declare const PSYS_SRC_ACCEL: number;
declare const PSYS_SRC_ANGLE_BEGIN: number;
declare const PSYS_SRC_ANGLE_END: number;
declare const PSYS_SRC_BURST_PART_COUNT: number;
declare const PSYS_SRC_BURST_RADIUS: number;
declare const PSYS_SRC_BURST_RATE: number;
declare const PSYS_SRC_BURST_SPEED_MAX: number;
declare const PSYS_SRC_BURST_SPEED_MIN: number;
declare const PSYS_SRC_MAX_AGE: number;
declare const PSYS_SRC_OBJ_REL_MASK: number;
declare const PSYS_SRC_OMEGA: number;
declare const PSYS_SRC_PATTERN: number;
declare const PSYS_SRC_PATTERN_ANGLE: number;
declare const PSYS_SRC_PATTERN_ANGLE_CONE: number;
declare const PSYS_SRC_PATTERN_ANGLE_CONE_EMPTY: number;
declare const PSYS_SRC_PATTERN_DROP: number;
declare const PSYS_SRC_PATTERN_EXPLODE: number;
declare const PSYS_SRC_TARGET_KEY: number;
declare const PSYS_SRC_TEXTURE: number;
declare const PUBLIC_CHANNEL: number;
declare const PURSUIT_FUZZ_FACTOR: number;
declare const PURSUIT_GOAL_TOLERANCE: number;
declare const PURSUIT_INTERCEPT: number;
declare const PURSUIT_OFFSET: number;
declare const PU_EVADE_HIDDEN: number;
declare const PU_EVADE_SPOTTED: number;
declare const PU_FAILURE_DYNAMIC_PATHFINDING_DISABLED: number;
declare const PU_FAILURE_INVALID_GOAL: number;
declare const PU_FAILURE_INVALID_START: number;
declare const PU_FAILURE_NO_NAVMESH: number;
declare const PU_FAILURE_NO_VALID_DESTINATION: number;
declare const PU_FAILURE_OTHER: number;
declare const PU_FAILURE_PARCEL_UNREACHABLE: number;
declare const PU_FAILURE_TARGET_GONE: number;
declare const PU_FAILURE_UNREACHABLE: number;
declare const PU_GOAL_REACHED: number;
declare const PU_SLOWDOWN_DISTANCE_REACHED: number;
declare const RAD_TO_DEG: number;
declare const RCERR_CAST_TIME_EXCEEDED: number;
declare const RCERR_SIM_PERF_LOW: number;
declare const RCERR_UNKNOWN: number;
declare const RC_DATA_FLAGS: number;
declare const RC_DETECT_PHANTOM: number;
declare const RC_GET_LINK_NUM: number;
declare const RC_GET_NORMAL: number;
declare const RC_GET_ROOT_KEY: number;
declare const RC_MAX_HITS: number;
declare const RC_REJECT_AGENTS: number;
declare const RC_REJECT_LAND: number;
declare const RC_REJECT_NONPHYSICAL: number;
declare const RC_REJECT_PHYSICAL: number;
declare const RC_REJECT_TYPES: number;
declare const REGION_FLAG_ALLOW_DAMAGE: number;
declare const REGION_FLAG_ALLOW_DIRECT_TELEPORT: number;
declare const REGION_FLAG_BLOCK_FLY: number;
declare const REGION_FLAG_BLOCK_FLYOVER: number;
declare const REGION_FLAG_BLOCK_TERRAFORM: number;
declare const REGION_FLAG_DISABLE_COLLISIONS: number;
declare const REGION_FLAG_DISABLE_PHYSICS: number;
declare const REGION_FLAG_FIXED_SUN: number;
declare const REGION_FLAG_RESTRICT_PUSHOBJECT: number;
declare const REGION_FLAG_SANDBOX: number;
declare const REQUIRE_LINE_OF_SIGHT: number;
declare const RESTITUTION: number;
declare const REVERSE: number;
declare const REZ_ACCEL: number;
declare const REZ_DAMAGE: number;
declare const REZ_DAMAGE_TYPE: number;
declare const REZ_FLAGS: number;
declare const REZ_FLAG_BLOCK_GRAB_OBJECT: number;
declare const REZ_FLAG_DIE_ON_COLLIDE: number;
declare const REZ_FLAG_DIE_ON_NOENTRY: number;
declare const REZ_FLAG_NO_COLLIDE_FAMILY: number;
declare const REZ_FLAG_NO_COLLIDE_OWNER: number;
declare const REZ_FLAG_PHANTOM: number;
declare const REZ_FLAG_PHYSICAL: number;
declare const REZ_FLAG_TEMP: number;
declare const REZ_LOCK_AXES: number;
declare const REZ_OMEGA: number;
declare const REZ_PARAM: number;
declare const REZ_PARAM_STRING: number;
declare const REZ_POS: number;
declare const REZ_ROT: number;
declare const REZ_SOUND: number;
declare const REZ_SOUND_COLLIDE: number;
declare const REZ_VEL: number;
declare const ROTATE: number;
declare const SCALE: number;
declare const SCRIPTED: number;
declare const SIM_STAT_ACTIVE_SCRIPT_COUNT: number;
declare const SIM_STAT_AGENT_COUNT: number;
declare const SIM_STAT_AGENT_MS: number;
declare const SIM_STAT_AGENT_UPDATES: number;
declare const SIM_STAT_AI_MS: number;
declare const SIM_STAT_ASSET_DOWNLOADS: number;
declare const SIM_STAT_ASSET_UPLOADS: number;
declare const SIM_STAT_CHILD_AGENT_COUNT: number;
declare const SIM_STAT_FRAME_MS: number;
declare const SIM_STAT_IMAGE_MS: number;
declare const SIM_STAT_IO_PUMP_MS: number;
declare const SIM_STAT_NET_MS: number;
declare const SIM_STAT_OTHER_MS: number;
declare const SIM_STAT_PACKETS_IN: number;
declare const SIM_STAT_PACKETS_OUT: number;
declare const SIM_STAT_PCT_CHARS_STEPPED: number;
declare const SIM_STAT_PHYSICS_FPS: number;
declare const SIM_STAT_PHYSICS_MS: number;
declare const SIM_STAT_PHYSICS_OTHER_MS: number;
declare const SIM_STAT_PHYSICS_SHAPE_MS: number;
declare const SIM_STAT_PHYSICS_STEP_MS: number;
declare const SIM_STAT_SCRIPT_EPS: number;
declare const SIM_STAT_SCRIPT_MS: number;
declare const SIM_STAT_SCRIPT_RUN_PCT: number;
declare const SIM_STAT_SLEEP_MS: number;
declare const SIM_STAT_SPARE_MS: number;
declare const SIM_STAT_UNACKED_BYTES: number;
declare const SIT_FLAG_ALLOW_UNSIT: number;
declare const SIT_FLAG_NO_COLLIDE: number;
declare const SIT_FLAG_NO_DAMAGE: number;
declare const SIT_FLAG_SCRIPTED_ONLY: number;
declare const SIT_FLAG_SIT_TARGET: number;
declare const SIT_INVALID_AGENT: number;
declare const SIT_INVALID_LINK: number;
declare const SIT_INVALID_OBJECT: number;
declare const SIT_NOT_EXPERIENCE: number;
declare const SIT_NO_ACCESS: number;
declare const SIT_NO_EXPERIENCE_PERMISSION: number;
declare const SIT_NO_SIT_TARGET: number;
declare const SKY_ABSORPTION_CONFIG: number;
declare const SKY_AMBIENT: number;
declare const SKY_BLUE: number;
declare const SKY_CLOUDS: number;
declare const SKY_CLOUD_TEXTURE: number;
declare const SKY_DENSITY_PROFILE_COUNTS: number;
declare const SKY_DOME: number;
declare const SKY_GAMMA: number;
declare const SKY_GLOW: number;
declare const SKY_HAZE: number;
declare const SKY_LIGHT: number;
declare const SKY_MIE_CONFIG: number;
declare const SKY_MOON: number;
declare const SKY_MOON_TEXTURE: number;
declare const SKY_PLANET: number;
declare const SKY_RAYLEIGH_CONFIG: number;
declare const SKY_REFLECTION_PROBE_AMBIANCE: number;
declare const SKY_REFRACTION: number;
declare const SKY_STAR_BRIGHTNESS: number;
declare const SKY_SUN: number;
declare const SKY_SUN_TEXTURE: number;
declare const SKY_TEXTURE_DEFAULTS: number;
declare const SMOOTH: number;
declare const SOUND_LOOP: number;
declare const SOUND_PLAY: number;
declare const SOUND_SYNC: number;
declare const SOUND_TRIGGER: number;
declare const SQRT2: number;
declare const STATUS_BLOCK_GRAB: number;
declare const STATUS_BLOCK_GRAB_OBJECT: number;
declare const STATUS_BOUNDS_ERROR: number;
declare const STATUS_CAST_SHADOWS: number;
declare const STATUS_DIE_AT_EDGE: number;
declare const STATUS_DIE_AT_NO_ENTRY: number;
declare const STATUS_INTERNAL_ERROR: number;
declare const STATUS_MALFORMED_PARAMS: number;
declare const STATUS_NOT_FOUND: number;
declare const STATUS_NOT_SUPPORTED: number;
declare const STATUS_OK: number;
declare const STATUS_PHANTOM: number;
declare const STATUS_PHYSICS: number;
declare const STATUS_RETURN_AT_EDGE: number;
declare const STATUS_ROTATE_X: number;
declare const STATUS_ROTATE_Y: number;
declare const STATUS_ROTATE_Z: number;
declare const STATUS_SANDBOX: number;
declare const STATUS_TYPE_MISMATCH: number;
declare const STATUS_WHITELIST_FAILED: number;
declare const STRING_TRIM: number;
declare const STRING_TRIM_HEAD: number;
declare const STRING_TRIM_TAIL: number;
declare const TARGETED_EMAIL_OBJECT_OWNER: number;
declare const TARGETED_EMAIL_ROOT_CREATOR: number;
declare const TEXTURE_BLANK: string;
declare const TEXTURE_DEFAULT: string;
declare const TEXTURE_MEDIA: string;
declare const TEXTURE_PLYWOOD: string;
declare const TEXTURE_TRANSPARENT: string;
declare const TOUCH_INVALID_FACE: number;
declare const TOUCH_INVALID_TEXCOORD: Vector;
declare const TOUCH_INVALID_VECTOR: Vector;
declare const TP_ROUTING_BLOCKED: number;
declare const TP_ROUTING_FREE: number;
declare const TP_ROUTING_LANDINGP: number;
declare const TRANSFER_BAD_OPTS: number;
declare const TRANSFER_BAD_ROOT: number;
declare const TRANSFER_DEST: number;
declare const TRANSFER_FLAGS: number;
declare const TRANSFER_FLAG_COPY: number;
declare const TRANSFER_FLAG_RESERVED: number;
declare const TRANSFER_FLAG_TAKE: number;
declare const TRANSFER_NO_ATTACHMENT: number;
declare const TRANSFER_NO_ITEMS: number;
declare const TRANSFER_NO_PERMS: number;
declare const TRANSFER_NO_TARGET: number;
declare const TRANSFER_OK: number;
declare const TRANSFER_THROTTLE: number;
declare const TRAVERSAL_TYPE: number;
declare const TRAVERSAL_TYPE_FAST: number;
declare const TRAVERSAL_TYPE_NONE: number;
declare const TRAVERSAL_TYPE_SLOW: number;
declare const TRUE: number;
declare const TWO_PI: number;
declare const TYPE_FLOAT: number;
declare const TYPE_INTEGER: number;
declare const TYPE_INVALID: number;
declare const TYPE_KEY: number;
declare const TYPE_ROTATION: number;
declare const TYPE_STRING: number;
declare const TYPE_VECTOR: number;
declare const URL_REQUEST_DENIED: string;
declare const URL_REQUEST_GRANTED: string;
declare const VEHICLE_ANGULAR_DEFLECTION_EFFICIENCY: number;
declare const VEHICLE_ANGULAR_DEFLECTION_TIMESCALE: number;
declare const VEHICLE_ANGULAR_FRICTION_TIMESCALE: number;
declare const VEHICLE_ANGULAR_MOTOR_DECAY_TIMESCALE: number;
declare const VEHICLE_ANGULAR_MOTOR_DIRECTION: number;
declare const VEHICLE_ANGULAR_MOTOR_TIMESCALE: number;
declare const VEHICLE_BANKING_EFFICIENCY: number;
declare const VEHICLE_BANKING_MIX: number;
declare const VEHICLE_BANKING_TIMESCALE: number;
declare const VEHICLE_BUOYANCY: number;
declare const VEHICLE_FLAG_BLOCK_INTERFERENCE: number;
declare const VEHICLE_FLAG_CAMERA_DECOUPLED: number;
declare const VEHICLE_FLAG_HOVER_GLOBAL_HEIGHT: number;
declare const VEHICLE_FLAG_HOVER_TERRAIN_ONLY: number;
declare const VEHICLE_FLAG_HOVER_UP_ONLY: number;
declare const VEHICLE_FLAG_HOVER_WATER_ONLY: number;
declare const VEHICLE_FLAG_LIMIT_MOTOR_UP: number;
declare const VEHICLE_FLAG_LIMIT_ROLL_ONLY: number;
declare const VEHICLE_FLAG_MOUSELOOK_BANK: number;
declare const VEHICLE_FLAG_MOUSELOOK_STEER: number;
declare const VEHICLE_FLAG_NO_DEFLECTION_UP: number;
declare const VEHICLE_HOVER_EFFICIENCY: number;
declare const VEHICLE_HOVER_HEIGHT: number;
declare const VEHICLE_HOVER_TIMESCALE: number;
declare const VEHICLE_LINEAR_DEFLECTION_EFFICIENCY: number;
declare const VEHICLE_LINEAR_DEFLECTION_TIMESCALE: number;
declare const VEHICLE_LINEAR_FRICTION_TIMESCALE: number;
declare const VEHICLE_LINEAR_MOTOR_DECAY_TIMESCALE: number;
declare const VEHICLE_LINEAR_MOTOR_DIRECTION: number;
declare const VEHICLE_LINEAR_MOTOR_OFFSET: number;
declare const VEHICLE_LINEAR_MOTOR_TIMESCALE: number;
declare const VEHICLE_REFERENCE_FRAME: number;
declare const VEHICLE_TYPE_AIRPLANE: number;
declare const VEHICLE_TYPE_BALLOON: number;
declare const VEHICLE_TYPE_BOAT: number;
declare const VEHICLE_TYPE_CAR: number;
declare const VEHICLE_TYPE_NONE: number;
declare const VEHICLE_TYPE_SLED: number;
declare const VEHICLE_VERTICAL_ATTRACTION_EFFICIENCY: number;
declare const VEHICLE_VERTICAL_ATTRACTION_TIMESCALE: number;
declare const VERTICAL: number;
declare const WANDER_PAUSE_AT_WAYPOINTS: number;
declare const WATER_BLUR_MULTIPLIER: number;
declare const WATER_FOG: number;
declare const WATER_FRESNEL: number;
declare const WATER_NORMAL_SCALE: number;
declare const WATER_NORMAL_TEXTURE: number;
declare const WATER_REFRACTION: number;
declare const WATER_TEXTURE_DEFAULTS: number;
declare const WATER_WAVE_DIRECTION: number;
declare const XP_ERROR_EXPERIENCES_DISABLED: number;
declare const XP_ERROR_EXPERIENCE_DISABLED: number;
declare const XP_ERROR_EXPERIENCE_SUSPENDED: number;
declare const XP_ERROR_INVALID_EXPERIENCE: number;
declare const XP_ERROR_INVALID_PARAMETERS: number;
declare const XP_ERROR_KEY_NOT_FOUND: number;
declare const XP_ERROR_MATURITY_EXCEEDED: number;
declare const XP_ERROR_NONE: number;
declare const XP_ERROR_NOT_FOUND: number;
declare const XP_ERROR_NOT_PERMITTED: number;
declare const XP_ERROR_NOT_PERMITTED_LAND: number;
declare const XP_ERROR_NO_EXPERIENCE: number;
declare const XP_ERROR_QUOTA_EXCEEDED: number;
declare const XP_ERROR_REQUEST_PERM_TIMEOUT: number;
declare const XP_ERROR_RETRY_UPDATE: number;
declare const XP_ERROR_STORAGE_EXCEPTION: number;
declare const XP_ERROR_STORE_DISABLED: number;
declare const XP_ERROR_THROTTLED: number;
declare const XP_ERROR_UNKNOWN_ERROR: number;

interface LinksetOptions {
    /** Owner key applied to all scripts in this linkset. */
    readonly owner?: string;
}
/**
 * A linkset owns the shared world state for its prims and scripts: the
 * single virtual clock, the LSD store, the cross-script link_message
 * capture, and the registry of prims + scripts. Per-script state stays on
 * `Script` / `ScriptState`.
 *
 * Single-script default: when `new Script(ast, options)` is called without
 * a host prim, a 1-prim/1-script linkset is auto-allocated. Existing tests
 * see no behavioral change.
 */
declare class Linkset {
    readonly clock: LinksetClock;
    readonly prims: Prim[];
    /** Linkset-wide LSD store (was per-script before multi-script support). */
    readonly linksetData: Map<string, LinksetDataEntry>;
    /**
     * Cross-script capture of every `llMessageLinked` invocation in this
     * linkset. Append-only; long-running tests should call
     * `clearLinkedMessages()` between scenarios to keep memory bounded.
     */
    readonly linkedMessages: LinkedMessageEntry[];
    /** Drop every captured cross-script linked-message entry. */
    clearLinkedMessages(): void;
    readonly owner: string;
    constructor(opts?: LinksetOptions);
    /** Add a prim to the linkset; assigns a 1-based linkNumber. */
    addPrim(prim: Prim): Prim;
    private recomputeLinkNumbers;
    /** Flat list of every script in every prim, in prim/inventory order. */
    allScripts(): Script[];
    /** Locate the prim containing `script`, or undefined. */
    primOf(script: Script): Prim | undefined;
    /** Resolve LINK_* / specific link number to the set of target prims. */
    resolveTargets(senderLink: number, target: number): Prim[];
    /**
     * Schedule `linkset_data` events on every script in the linkset. The
     * caller is expected to have already mutated the shared LSD store before
     * broadcasting.
     */
    broadcastLinksetData(action: number, name: string, value: string): void;
    /**
     * Send a `link_message` according to LSL fan-out semantics.
     * `senderLink` is the calling prim's link number; the event payload's
     * `sender_num` is set to that value. The capture array on the linkset
     * records every invocation for cross-script test assertions.
     */
    deliverLinkMessage(senderLink: number, target: number, num: number, str: string, id: string): void;
    /**
     * Deliver chat to every script in the linkset whose listens match. Useful
     * for region/world-level chat simulation. `Script.deliverChat` remains
     * available for the single-script case (delivers only to that script).
     */
    deliverChat(opts: {
        channel: number;
        name: string;
        key: string;
        message: string;
    }): void;
    /**
     * Advance the shared clock by `ms` and drain every event that becomes
     * due, dispatching each to its target script.
     */
    advanceTime(ms: number): void;
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
    drainQueue(): void;
}

interface PrimOptions {
    readonly key?: string;
    readonly name?: string;
    readonly description?: string;
}
/**
 * A single prim in a linkset. Holds the prim's identity, its script roster,
 * its (full) inventory, and the PRIM_* parameter store. Scripts join a prim
 * via `prim.addScript(script)`.
 */
declare class Prim {
    /** 1-based link number assigned by the host Linkset. 0 = unlinked single prim. */
    linkNumber: number;
    key: string;
    name: string;
    description: string;
    readonly scripts: Script[];
    readonly inventory: InventoryItem[];
    readonly params: PrimParams;
    /**
     * llSetStatus / PRIM_PHYSICS / PRIM_PHANTOM bitfield. Stored on the prim
     * (not in `params`) so `STATUS_*` flags without a PRIM_* counterpart
     * (BLOCK_GRAB, DIE_AT_EDGE, ROTATE_*, etc.) live alongside the
     * PRIM_PHYSICS / PRIM_PHANTOM bits in one place.
     */
    statusFlags: number;
    appearance: {
        text: {
            text: string;
            color: {
                x: number;
                y: number;
                z: number;
            };
            alpha: number;
        } | null;
        description: string;
    };
    /** Set when this prim joins a linkset. */
    linkset?: Linkset;
    constructor(opts?: PrimOptions);
    /** Add a script to this prim's inventory and roster. */
    addScript(script: Script, opts?: {
        name?: string;
        key?: string;
    }): void;
    /**
     * Add a non-script inventory item (notecard, texture, etc.). The caller
     * is responsible for setting `acquireTimeMs`; if you want it to default
     * to the current linkset clock, build the item with `makeInventoryItem`
     * and pass `acquireTimeMs: this.linkset?.clock.now ?? 0`.
     */
    addInventory(item: InventoryItem): void;
    /** Find a script by inventory name. */
    findScript(name: string): Script | undefined;
    /**
     * Read one PRIM_* rule starting at `cursor` in `rules`. Returns the flat
     * value list and the number of slots consumed past the rule constant
     * (face index, etc.), or `null` for unknown / unsupported constants.
     */
    getPrimParam(param: number, rules: ReadonlyArray<LslValue>, cursor: number): {
        values: LslValue[];
        consumed: number;
    } | null;
    /**
     * Apply one PRIM_* rule starting at `cursor` in `rules`. Returns the
     * number of slots consumed past the rule constant, or `null` for
     * unknown / unsupported constants (caller stops walking).
     */
    setPrimParam(param: number, rules: ReadonlyArray<LslValue>, cursor: number): number | null;
    /** llSetStatus seam. STATUS_* is a bit value; sets or clears it. */
    setStatus(flag: number, value: boolean): void;
}

type StatementKind = Statement['kind'];
interface StatementInfo {
    readonly id: number;
    readonly line: number;
    readonly col: number;
    readonly kind: StatementKind;
}
type BranchKind = 'if' | 'while' | 'do-while' | 'for';
interface BranchInfo {
    readonly id: number;
    readonly line: number;
    readonly col: number;
    readonly kind: BranchKind;
    /** False when the AST has no `else` arm — the implicit-else outcome still
     *  counts toward branch coverage when the test ever evaluates false. */
    readonly hasElse: boolean;
}
type FunctionKind = 'function' | 'event';
interface FunctionInfo {
    readonly id: number;
    readonly name: string;
    readonly line: number;
    readonly col: number;
    readonly kind: FunctionKind;
    /** State name for events; undefined for free functions. */
    readonly state?: string;
}
interface StateInfo {
    readonly id: number;
    readonly name: string;
    readonly line: number;
    readonly col: number;
}
interface CoveragePlan {
    readonly filename: string;
    readonly source: string;
    readonly statements: ReadonlyArray<StatementInfo>;
    readonly branches: ReadonlyArray<BranchInfo>;
    readonly functions: ReadonlyArray<FunctionInfo>;
    readonly states: ReadonlyArray<StateInfo>;
}
interface StatementHit extends StatementInfo {
    readonly hits: number;
}
interface BranchHit extends BranchInfo {
    /**
     * `[trueHits, falseHits]` — count of times the conditional expression
     * evaluated truthy / falsy, respectively. For `if`, true means consequent
     * taken, false means alternate (or implicit-else) taken. For `while` /
     * `for`, true means another iteration started, false means the loop
     * exited. **For `do-while`, the body always runs at least once before
     * the test is evaluated**, so a single-pass do-while produces `[0, 1]`
     * (zero true outcomes, one false outcome that ended the loop) even
     * though the body executed once — body-entered counts live in statement
     * coverage on the body, not branch coverage on the loop.
     */
    readonly hits: readonly [number, number];
}
interface FunctionHit extends FunctionInfo {
    readonly hits: number;
}
interface StateHit extends StateInfo {
    readonly hits: number;
}
interface CoverageReport {
    readonly filename: string;
    readonly source: string;
    readonly statements: ReadonlyArray<StatementHit>;
    readonly branches: ReadonlyArray<BranchHit>;
    readonly functions: ReadonlyArray<FunctionHit>;
    readonly states: ReadonlyArray<StateHit>;
}
/**
 * Walks an AST and enumerates every coverable item.
 * Coverage IDs are `loc.offset` — stable across the lifetime of a single
 * parse, unique within a file, and cheap to use as Map keys.
 */
declare function buildCoveragePlan(ast: Script$1, filename: string, source: string): CoveragePlan;
/**
 * Per-script hit counter. Lives on `ScriptState.coverage` when coverage is
 * enabled; otherwise the field is null and hooks short-circuit.
 *
 * Counts are kept in plain Maps keyed by `loc.offset`. State coverage is
 * keyed by state name — state changes name targets, not offsets.
 */
declare class CoverageCollector {
    readonly plan: CoveragePlan;
    private readonly statementHits;
    private readonly branchHits;
    private readonly functionHits;
    private readonly stateHits;
    constructor(plan: CoveragePlan);
    hitStatement(loc: SourceLocation): void;
    hitBranch(loc: SourceLocation, taken: boolean): void;
    hitFunction(loc: SourceLocation): void;
    hitState(name: string): void;
    /** Frozen snapshot suitable for serialization or assertions. */
    snapshot(): CoverageReport;
}
/**
 * Merge multiple reports for the same filename into one. Used by the Vitest
 * reporter when the same script is loaded across multiple tests in a run:
 * planes match, hit counts union (sum).
 *
 * Throws if reports disagree on filename or plan shape — that signals a
 * source change mid-run, which should fail loudly rather than be glossed.
 */
declare function mergeReports(reports: ReadonlyArray<CoverageReport>): CoverageReport;

/** Script-identity values exposed via llGetOwner / llGetKey / etc. */
interface ScriptIdentity {
    /** Linkset owner key. */
    readonly owner: string;
    /** Prim key (delegated to host prim). */
    readonly objectKey: string;
    /** Prim name; mutated by llSetObjectName. */
    objectName: string;
    /** Script's inventory name. */
    readonly scriptName: string;
}
type ChatType = 'say' | 'shout' | 'whisper' | 'regionSay' | 'regionSayTo' | 'ownerSay' | 'im';
interface ChatEntry {
    readonly channel: number;
    readonly text: string;
    readonly type: ChatType;
    /** For `regionSayTo` / `instantMessage`: the target avatar/object key. */
    readonly to?: string;
}
interface CallEntry {
    readonly name: string;
    readonly args: ReadonlyArray<LslValue>;
    readonly returned: LslValue | undefined;
}
/**
 * Mutable state owned by a single Script instance. Built-ins and the
 * interpreter both read and write this; the public Script handle exposes
 * curated views.
 *
 * `linksetData` and `appearance` are aliased to the host linkset / prim's
 * storage so existing builtins that read `ctx.state.linksetData` /
 * `ctx.state.appearance` keep working unchanged across multi-script setups.
 */
interface ScriptState {
    /** Current LSL state name. Starts at "default". */
    currentState: string;
    readonly chat: ChatEntry[];
    readonly calls: CallEntry[];
    readonly clock: ScriptClockView;
    readonly httpRequests: HttpRequestEntry[];
    /** Monotonic counter feeding deterministic HTTP request keys. */
    httpKeyCounter: number;
    readonly listens: ListenEntry[];
    /** Monotonic counter for llListen handles. */
    listenHandleCounter: number;
    readonly random: Mulberry32;
    identity: ScriptIdentity;
    /** Per-script capture of llMessageLinked invocations from this script. */
    readonly linkedMessages: LinkedMessageEntry[];
    readonly dataserverRequests: DataserverRequestEntry[];
    /** Monotonic counter for dataserver request keys. */
    dataserverKeyCounter: number;
    /**
     * Stack of detected contexts pushed during touch / sensor / collision
     * handler invocation. Top-of-stack is the active context for llDetected*.
     */
    readonly detectedStack: DetectedContext[];
    /**
     * Linkset Data store — aliased to `linkset.linksetData`. Survives
     * llResetScript (the LSD store is owned by the linkset). `password === ''`
     * means the entry is unprotected. Map insertion order matches the LSL
     * contract that llLinksetDataListKeys returns keys in write order.
     */
    readonly linksetData: Map<string, LinksetDataEntry>;
    /**
     * Prim appearance — aliased to `prim.appearance`. Set by llSetText /
     * llSetObjectDesc / etc.
     */
    appearance: {
        text: {
            text: string;
            color: {
                x: number;
                y: number;
                z: number;
            };
            alpha: number;
        } | null;
        description: string;
    };
    /** Lifecycle flags — `dead` is set when llDie runs. */
    lifecycle: {
        dead: boolean;
    };
    /** Source filename used for coverage attribution. "<inline>" for inline-source loads. */
    readonly filename: string;
    /** Original LSL source — kept for LCOV / Istanbul line maps. Empty when caller didn't supply it. */
    readonly source: string;
    /** Coverage collector when enabled, otherwise null. Hooks short-circuit on null. */
    coverage: CoverageCollector | null;
}
type BuiltinImpl = (ctx: CallContext, args: ReadonlyArray<LslValue>) => LslValue | undefined;
interface CallContext {
    readonly state: ScriptState;
    readonly spec: BuiltinSpec | undefined;
    readonly script: Script;
    readonly prim: Prim;
    readonly linkset: Linkset;
}

interface ScriptOptions {
    /** Filename used in diagnostics; defaults to "<inline>". */
    readonly filename?: string;
    /**
     * Seed for the script's PRNG (used by llFrand and friends). Default 1.
     * Pin a seed per test if you need deterministic random output.
     */
    readonly randomSeed?: number;
    /** Owner key returned by llGetOwner. Defaults to NULL_KEY. */
    readonly owner?: string;
    /** Prim key returned by llGetKey. Defaults to a deterministic per-script key. */
    readonly objectKey?: string;
    /** Prim name returned by llGetObjectName. Defaults to "Object". */
    readonly objectName?: string;
    /** Script name returned by llGetScriptName. Defaults to filename basename or "script". */
    readonly scriptName?: string;
    /**
     * Host prim. If omitted, a 1-prim default linkset is auto-allocated. Pass
     * a prim that's already been added to a Linkset to opt into multi-script.
     */
    readonly host?: Prim;
    /**
     * Original LSL source — kept on the script for LCOV / Istanbul line maps
     * when coverage is enabled. loadScript() supplies this automatically.
     */
    readonly source?: string;
    /**
     * Enable coverage collection on this script. When true, `script.coverage`
     * returns a snapshot after each test; default false (zero overhead).
     */
    readonly coverage?: boolean;
}
/**
 * Public handle for a loaded LSL script. Tests interact almost entirely
 * with this surface: drive events via fire(), inspect chat / calls,
 * override functions via mock(), read or seed globals.
 */
declare class Script {
    private readonly ast;
    private readonly state;
    private readonly mocks;
    private readonly globals;
    private readonly userFunctions;
    private readonly handlersByState;
    private started;
    /** Per-script clock facade (timer state + time reference). */
    readonly clockView: ScriptClockView;
    readonly host: Prim;
    readonly linkset: Linkset;
    readonly scriptName: string;
    /** When false, drainQueue parks events instead of delivering them. */
    running: boolean;
    /** Events parked while `running === false`; replayed when re-enabled. */
    readonly parkedEvents: Array<{
        at: number;
        event: string;
        payload: Record<string, unknown>;
    }>;
    constructor(ast: Script$1, options?: ScriptOptions);
    /** Current virtual time in milliseconds since linkset construction. */
    get now(): number;
    /**
     * Advance the linkset clock by `ms` and fire every queued event whose
     * scheduled time is ≤ the new now (across all scripts in the linkset).
     * Convenience pass-through to `linkset.advanceTime`.
     */
    advanceTime(ms: number): void;
    /**
     * Configured recurring timer interval in seconds, or 0 if no timer is
     * registered. Mirrors `llSetTimerEvent`'s most recent argument.
     */
    get timerInterval(): number;
    /** Current LSL state name. */
    get currentState(): string;
    /**
     * Coverage report snapshot, or null when coverage is disabled. Each call
     * returns a fresh frozen object — safe to retain across further fire()s
     * without seeing later mutations.
     */
    get coverage(): CoverageReport | null;
    /** Captured chat output (llSay/llShout/llWhisper/llOwnerSay/...). */
    get chat(): ReadonlyArray<ChatEntry>;
    /** Universal log of every ll* call this script has made. Filter with callsOf(name). */
    get calls(): ReadonlyArray<CallEntry>;
    /** Filtered call log: only entries for `name`. */
    callsOf(name: string): ReadonlyArray<CallEntry>;
    /** Captured outgoing HTTP requests from `llHTTPRequest`. */
    get httpRequests(): ReadonlyArray<HttpRequestEntry>;
    /**
     * Feed a response to a previously captured HTTP request. Schedules an
     * `http_response` event for immediate delivery.
     */
    respondToHttp(key: string, response: {
        status: number;
        body?: string;
        metadata?: ReadonlyArray<unknown>;
    }): void;
    /** Convenience: respond to the most recent HTTP request. */
    respondToLastHttp(response: {
        status: number;
        body?: string;
        metadata?: ReadonlyArray<unknown>;
    }): void;
    /** Currently active listen registrations (from `llListen`). */
    get listens(): ReadonlyArray<ListenEntry>;
    /** Captured llMessageLinked invocations originating from this script. */
    get linkedMessages(): ReadonlyArray<LinkedMessageEntry>;
    /** Drop every captured outgoing linked-message entry for this script. */
    clearLinkedMessages(): void;
    /** Captured pending dataserver requests (llRequestAgentData and friends). */
    get dataserverRequests(): ReadonlyArray<DataserverRequestEntry>;
    /**
     * Feed a value back to a pending dataserver request. Schedules a
     * `dataserver` event with the request key and a string value.
     */
    respondToDataserver(key: string, value: string): void;
    /** Convenience: respond to the most recent dataserver request. */
    respondToLastDataserver(value: string): void;
    /** Currently displayed floating text (from llSetText). null if unset. */
    get text(): {
        text: string;
        color: {
            x: number;
            y: number;
            z: number;
        };
        alpha: number;
    } | null;
    /** Object description from llSetObjectDesc. */
    get objectDesc(): string;
    /**
     * Read-only view of the Linkset Data store. Tests can iterate to assert on
     * keys / values / protection. Modify via the LSL builtins or seedLinksetData.
     */
    get linksetData(): ReadonlyMap<string, LinksetDataEntry>;
    /**
     * White-box helper: pre-populate the Linkset Data store without going
     * through llLinksetDataWrite. Does not fire linkset_data events.
     */
    seedLinksetData(entries: Iterable<readonly [string, {
        value: string;
        password?: string;
    }]>): void;
    /** True once `llDie()` has been called. Subsequent fire() calls are no-ops. */
    get dead(): boolean;
    /**
     * Match chat against this script's listens and queue `listen` events for
     * every match. Does not drain — caller does that. Used by Linkset.deliverChat
     * for cross-script delivery.
     */
    matchChatListens(opts: {
        channel: number;
        name: string;
        key: string;
        message: string;
    }): void;
    /**
     * Deliver chat to this script only. Linkset-wide delivery (every listening
     * script in the linkset) is `linkset.deliverChat`.
     */
    deliverChat(opts: {
        channel: number;
        name: string;
        key: string;
        message: string;
    }): void;
    /**
     * Override an `ll*` function for the lifetime of this Script. Replaces
     * any built-in or stub of the same name.
     */
    mock(name: string, impl: BuiltinImpl): void;
    /** Read a global variable's current value. White-box hook for tests. */
    global(name: string): LslValue;
    /** Seed a global variable. The value is coerced to the global's declared type. */
    setGlobal(name: string, value: LslValue, type?: LslType): void;
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
    fire(eventName: string, payload?: Record<string, unknown>): void;
    /**
     * Run state_entry of the default state. If the script has been auto-started
     * (e.g. by an earlier fire), this is a no-op.
     */
    start(): void;
    /**
     * Reset the script as if `llResetScript` had been called: clear globals,
     * reseed them from the AST initializers, return to the default state,
     * cancel timers, and run state_entry. Used internally when llResetScript
     * is invoked from inside a handler; tests can also call it directly.
     */
    reset(): void;
    /**
     * Internal: invoked by `Linkset.drainQueue` to deliver one queued event.
     * The synthetic `__reset` event triggers a sibling-initiated reset
     * (scheduled by `llResetOtherScript`).
     */
    deliver(event: string, payload: Record<string, unknown>): void;
    /**
     * Push a detected context (if the payload includes `detected`) for the
     * duration of `fn`, so llDetectedKey / Name / Pos / etc. inside the
     * handler resolve to the right entries.
     */
    private withDetected;
    /**
     * Run a handler and process any state-change signal it raises.
     *
     * LSL semantics: when a handler executes `state foo;`, control leaves the
     * handler immediately, the current state's `state_exit` fires, the state
     * changes, then the new state's `state_entry` fires. We mirror that here
     * with a small loop so that a `state_exit` or `state_entry` that itself
     * does `state foo;` continues the chain correctly.
     */
    private runHandler;
    /**
     * Mark this script as dead and cancel its timer. Used by llDie to bring
     * down every script in the linkset. Idempotent.
     */
    markDead(): void;
    /**
     * Replay any events parked while this script was disabled. Caller is
     * responsible for advancing the linkset clock if needed afterwards.
     */
    resumeParked(): void;
}

interface EventParamSpec {
    readonly name: string;
    readonly type: LslType;
}
interface EventSpec {
    readonly name: string;
    readonly params: ReadonlyArray<EventParamSpec>;
}
declare const EVENT_SPECS: {
    readonly at_rot_target: {
        readonly name: "at_rot_target";
        readonly params: readonly [{
            readonly name: "tnum";
            readonly type: "integer";
        }, {
            readonly name: "targetrot";
            readonly type: "rotation";
        }, {
            readonly name: "ourrot";
            readonly type: "rotation";
        }];
    };
    readonly at_target: {
        readonly name: "at_target";
        readonly params: readonly [{
            readonly name: "tnum";
            readonly type: "integer";
        }, {
            readonly name: "targetpos";
            readonly type: "vector";
        }, {
            readonly name: "ourpos";
            readonly type: "vector";
        }];
    };
    readonly attach: {
        readonly name: "attach";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly changed: {
        readonly name: "changed";
        readonly params: readonly [{
            readonly name: "change";
            readonly type: "integer";
        }];
    };
    readonly collision: {
        readonly name: "collision";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly collision_end: {
        readonly name: "collision_end";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly collision_start: {
        readonly name: "collision_start";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly control: {
        readonly name: "control";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "level";
            readonly type: "integer";
        }, {
            readonly name: "edge";
            readonly type: "integer";
        }];
    };
    readonly dataserver: {
        readonly name: "dataserver";
        readonly params: readonly [{
            readonly name: "queryid";
            readonly type: "key";
        }, {
            readonly name: "data";
            readonly type: "string";
        }];
    };
    readonly email: {
        readonly name: "email";
        readonly params: readonly [{
            readonly name: "time";
            readonly type: "string";
        }, {
            readonly name: "address";
            readonly type: "string";
        }, {
            readonly name: "subj";
            readonly type: "string";
        }, {
            readonly name: "message";
            readonly type: "string";
        }, {
            readonly name: "num_left";
            readonly type: "integer";
        }];
    };
    readonly experience_permissions: {
        readonly name: "experience_permissions";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }];
    };
    readonly experience_permissions_denied: {
        readonly name: "experience_permissions_denied";
        readonly params: readonly [{
            readonly name: "agent";
            readonly type: "key";
        }, {
            readonly name: "reason";
            readonly type: "integer";
        }];
    };
    readonly final_damage: {
        readonly name: "final_damage";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly game_control: {
        readonly name: "game_control";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "button_states";
            readonly type: "integer";
        }, {
            readonly name: "axis_values";
            readonly type: "list";
        }];
    };
    readonly http_request: {
        readonly name: "http_request";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "method";
            readonly type: "string";
        }, {
            readonly name: "body";
            readonly type: "string";
        }];
    };
    readonly http_response: {
        readonly name: "http_response";
        readonly params: readonly [{
            readonly name: "request_id";
            readonly type: "key";
        }, {
            readonly name: "status";
            readonly type: "integer";
        }, {
            readonly name: "metadata";
            readonly type: "list";
        }, {
            readonly name: "body";
            readonly type: "string";
        }];
    };
    readonly land_collision: {
        readonly name: "land_collision";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly land_collision_end: {
        readonly name: "land_collision_end";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly land_collision_start: {
        readonly name: "land_collision_start";
        readonly params: readonly [{
            readonly name: "pos";
            readonly type: "vector";
        }];
    };
    readonly link_message: {
        readonly name: "link_message";
        readonly params: readonly [{
            readonly name: "sender_num";
            readonly type: "integer";
        }, {
            readonly name: "num";
            readonly type: "integer";
        }, {
            readonly name: "str";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly linkset_data: {
        readonly name: "linkset_data";
        readonly params: readonly [{
            readonly name: "action";
            readonly type: "integer";
        }, {
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "value";
            readonly type: "string";
        }];
    };
    readonly listen: {
        readonly name: "listen";
        readonly params: readonly [{
            readonly name: "channel";
            readonly type: "integer";
        }, {
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "message";
            readonly type: "string";
        }];
    };
    readonly money: {
        readonly name: "money";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "amount";
            readonly type: "integer";
        }];
    };
    readonly moving_end: {
        readonly name: "moving_end";
        readonly params: readonly [];
    };
    readonly moving_start: {
        readonly name: "moving_start";
        readonly params: readonly [];
    };
    readonly no_sensor: {
        readonly name: "no_sensor";
        readonly params: readonly [];
    };
    readonly not_at_rot_target: {
        readonly name: "not_at_rot_target";
        readonly params: readonly [];
    };
    readonly not_at_target: {
        readonly name: "not_at_target";
        readonly params: readonly [];
    };
    readonly object_rez: {
        readonly name: "object_rez";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }];
    };
    readonly on_damage: {
        readonly name: "on_damage";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly on_death: {
        readonly name: "on_death";
        readonly params: readonly [];
    };
    readonly on_rez: {
        readonly name: "on_rez";
        readonly params: readonly [{
            readonly name: "start_param";
            readonly type: "integer";
        }];
    };
    readonly path_update: {
        readonly name: "path_update";
        readonly params: readonly [{
            readonly name: "type";
            readonly type: "integer";
        }, {
            readonly name: "reserved";
            readonly type: "list";
        }];
    };
    readonly remote_data: {
        readonly name: "remote_data";
        readonly params: readonly [{
            readonly name: "event_type";
            readonly type: "integer";
        }, {
            readonly name: "channel";
            readonly type: "key";
        }, {
            readonly name: "message_id";
            readonly type: "key";
        }, {
            readonly name: "sender";
            readonly type: "string";
        }, {
            readonly name: "idata";
            readonly type: "integer";
        }, {
            readonly name: "sdata";
            readonly type: "string";
        }];
    };
    readonly run_time_permissions: {
        readonly name: "run_time_permissions";
        readonly params: readonly [{
            readonly name: "perm";
            readonly type: "integer";
        }];
    };
    readonly sensor: {
        readonly name: "sensor";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly state_entry: {
        readonly name: "state_entry";
        readonly params: readonly [];
    };
    readonly state_exit: {
        readonly name: "state_exit";
        readonly params: readonly [];
    };
    readonly timer: {
        readonly name: "timer";
        readonly params: readonly [];
    };
    readonly touch: {
        readonly name: "touch";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly touch_end: {
        readonly name: "touch_end";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly touch_start: {
        readonly name: "touch_start";
        readonly params: readonly [{
            readonly name: "num_detected";
            readonly type: "integer";
        }];
    };
    readonly transaction_result: {
        readonly name: "transaction_result";
        readonly params: readonly [{
            readonly name: "id";
            readonly type: "key";
        }, {
            readonly name: "success";
            readonly type: "integer";
        }, {
            readonly name: "data";
            readonly type: "string";
        }];
    };
};
type EventName = keyof typeof EVENT_SPECS;
/** Typed payload for each event. Used by Script.fire() so callers get IDE help. */
interface EventPayloads {
    at_rot_target: {
        readonly tnum: number;
        readonly targetrot: Rotation;
        readonly ourrot: Rotation;
    };
    at_target: {
        readonly tnum: number;
        readonly targetpos: Vector;
        readonly ourpos: Vector;
    };
    attach: {
        readonly id: string;
    };
    changed: {
        readonly change: number;
    };
    collision: {
        readonly num_detected: number;
    };
    collision_end: {
        readonly num_detected: number;
    };
    collision_start: {
        readonly num_detected: number;
    };
    control: {
        readonly id: string;
        readonly level: number;
        readonly edge: number;
    };
    dataserver: {
        readonly queryid: string;
        readonly data: string;
    };
    email: {
        readonly time: string;
        readonly address: string;
        readonly subj: string;
        readonly message: string;
        readonly num_left: number;
    };
    experience_permissions: {
        readonly agent: string;
    };
    experience_permissions_denied: {
        readonly agent: string;
        readonly reason: number;
    };
    final_damage: {
        readonly num_detected: number;
    };
    game_control: {
        readonly id: string;
        readonly button_states: number;
        readonly axis_values: ReadonlyArray<unknown>;
    };
    http_request: {
        readonly id: string;
        readonly method: string;
        readonly body: string;
    };
    http_response: {
        readonly request_id: string;
        readonly status: number;
        readonly metadata: ReadonlyArray<unknown>;
        readonly body: string;
    };
    land_collision: {
        readonly pos: Vector;
    };
    land_collision_end: {
        readonly pos: Vector;
    };
    land_collision_start: {
        readonly pos: Vector;
    };
    link_message: {
        readonly sender_num: number;
        readonly num: number;
        readonly str: string;
        readonly id: string;
    };
    linkset_data: {
        readonly action: number;
        readonly name: string;
        readonly value: string;
    };
    listen: {
        readonly channel: number;
        readonly name: string;
        readonly id: string;
        readonly message: string;
    };
    money: {
        readonly id: string;
        readonly amount: number;
    };
    moving_end: {};
    moving_start: {};
    no_sensor: {};
    not_at_rot_target: {};
    not_at_target: {};
    object_rez: {
        readonly id: string;
    };
    on_damage: {
        readonly num_detected: number;
    };
    on_death: {};
    on_rez: {
        readonly start_param: number;
    };
    path_update: {
        readonly type: number;
        readonly reserved: ReadonlyArray<unknown>;
    };
    remote_data: {
        readonly event_type: number;
        readonly channel: string;
        readonly message_id: string;
        readonly sender: string;
        readonly idata: number;
        readonly sdata: string;
    };
    run_time_permissions: {
        readonly perm: number;
    };
    sensor: {
        readonly num_detected: number;
    };
    state_entry: {};
    state_exit: {};
    timer: {};
    touch: {
        readonly num_detected: number;
    };
    touch_end: {
        readonly num_detected: number;
    };
    touch_start: {
        readonly num_detected: number;
    };
    transaction_result: {
        readonly id: string;
        readonly success: number;
        readonly data: string;
    };
}

interface ConstantEntry {
    readonly type: LslType;
    readonly value: number | string | Vector | Rotation;
}
/**
 * Every kwdb-derived constant exported by name with its type tag, so the
 * VM can pre-load them into a base environment scope visible to all scripts.
 */
declare const CONSTANT_TABLE: Record<string, ConstantEntry>;

interface InlineScriptInput extends ScriptOptions {
    /** LSL source code as a string. */
    readonly source: string;
    /** Optional virtual filename for diagnostics; defaults to "<inline>". */
    readonly filename?: string;
}
type LoadScriptInput = string | InlineScriptInput;
/**
 * Parse and instantiate an LSL script ready for testing.
 *
 * Pass a file path to load from disk, or `{ source, ...options }` for an
 * inline string. Options propagate to the Script (random seed, owner key,
 * object/script name).
 *
 * Coverage activates when any of: `coverage: true` in options, the Vitest
 * coverage reporter has been installed, or `LSL_COVERAGE=1` in the env.
 *
 * Parse errors throw `LslParseError`, which Vitest renders with the
 * offending `file:line:col`.
 */
declare function loadScript(input: LoadScriptInput): Promise<Script>;

interface InlineSource {
    /** LSL source code as a string. */
    readonly source: string;
    /** Optional virtual filename for diagnostics; defaults to "<inline>". */
    readonly filename?: string;
}
type ScriptSource = string | InlineSource;
interface ScriptInput extends Omit<ScriptOptions, 'source'> {
    /** Path or inline source. */
    readonly source: ScriptSource;
    /** Inventory name override (defaults to scriptName / filename basename). */
    readonly name?: string;
}
interface PrimInput extends PrimOptions {
    /** Scripts hosted on this prim. */
    readonly scripts?: ReadonlyArray<ScriptInput>;
    /** Non-script inventory items (notecards, textures, …). */
    readonly inventory?: ReadonlyArray<InventoryItem>;
}
interface LinksetInput extends LinksetOptions {
    readonly prims: ReadonlyArray<PrimInput>;
}
interface LoadedLinkset {
    readonly linkset: Linkset;
    readonly prims: ReadonlyArray<Prim>;
    /** Flat name → Script lookup across all prims. */
    readonly scripts: Readonly<Record<string, Script>>;
}
/**
 * Build a multi-prim, multi-script Linkset for tests. Each prim hosts one or
 * more scripts; the returned `scripts` map keys by inventory name.
 *
 * Existing single-script tests continue to use `loadScript`; this is the
 * additive multi-script path.
 */
declare function loadLinkset(input: LinksetInput): Promise<LoadedLinkset>;

export { ACTIVE, AGENT, AGENT_ALWAYS_RUN, AGENT_ATTACHMENTS, AGENT_AUTOMATED, AGENT_AUTOPILOT, AGENT_AWAY, AGENT_BUSY, AGENT_BY_LEGACY_NAME, AGENT_BY_USERNAME, AGENT_CROUCHING, AGENT_FLOATING_VIA_SCRIPTED_ATTACHMENT, AGENT_FLYING, AGENT_IN_AIR, AGENT_LIST_PARCEL, AGENT_LIST_PARCEL_OWNER, AGENT_LIST_REGION, AGENT_MOUSELOOK, AGENT_ON_OBJECT, AGENT_SCRIPTED, AGENT_SITTING, AGENT_TYPING, AGENT_WALKING, ALL_SIDES, ANIM_ON, ATTACH_ANY_HUD, ATTACH_AVATAR_CENTER, ATTACH_BACK, ATTACH_BELLY, ATTACH_CHEST, ATTACH_CHIN, ATTACH_FACE_JAW, ATTACH_FACE_LEAR, ATTACH_FACE_LEYE, ATTACH_FACE_REAR, ATTACH_FACE_REYE, ATTACH_FACE_TONGUE, ATTACH_GROIN, ATTACH_HEAD, ATTACH_HIND_LFOOT, ATTACH_HIND_RFOOT, ATTACH_HUD_BOTTOM, ATTACH_HUD_BOTTOM_LEFT, ATTACH_HUD_BOTTOM_RIGHT, ATTACH_HUD_CENTER_1, ATTACH_HUD_CENTER_2, ATTACH_HUD_TOP_CENTER, ATTACH_HUD_TOP_LEFT, ATTACH_HUD_TOP_RIGHT, ATTACH_LEAR, ATTACH_LEFT_PEC, ATTACH_LEYE, ATTACH_LFOOT, ATTACH_LHAND, ATTACH_LHAND_RING1, ATTACH_LHIP, ATTACH_LLARM, ATTACH_LLLEG, ATTACH_LPEC, ATTACH_LSHOULDER, ATTACH_LUARM, ATTACH_LULEG, ATTACH_LWING, ATTACH_MOUTH, ATTACH_NECK, ATTACH_NOSE, ATTACH_PELVIS, ATTACH_REAR, ATTACH_REYE, ATTACH_RFOOT, ATTACH_RHAND, ATTACH_RHAND_RING1, ATTACH_RHIP, ATTACH_RIGHT_PEC, ATTACH_RLARM, ATTACH_RLLEG, ATTACH_RPEC, ATTACH_RSHOULDER, ATTACH_RUARM, ATTACH_RULEG, ATTACH_RWING, ATTACH_TAIL_BASE, ATTACH_TAIL_TIP, AVOID_CHARACTERS, AVOID_DYNAMIC_OBSTACLES, AVOID_NONE, BEACON_MAP, BUILTIN_SPECS, type BranchHit, type BranchInfo, type BranchKind, type BuiltinImpl, type BuiltinName, type BuiltinSpec, CAMERA_ACTIVE, CAMERA_BEHINDNESS_ANGLE, CAMERA_BEHINDNESS_LAG, CAMERA_DISTANCE, CAMERA_FOCUS, CAMERA_FOCUS_LAG, CAMERA_FOCUS_LOCKED, CAMERA_FOCUS_OFFSET, CAMERA_FOCUS_THRESHOLD, CAMERA_PITCH, CAMERA_POSITION, CAMERA_POSITION_LAG, CAMERA_POSITION_LOCKED, CAMERA_POSITION_THRESHOLD, CHANGED_ALLOWED_DROP, CHANGED_COLOR, CHANGED_INVENTORY, CHANGED_LINK, CHANGED_MEDIA, CHANGED_OWNER, CHANGED_REGION, CHANGED_REGION_START, CHANGED_RENDER_MATERIAL, CHANGED_SCALE, CHANGED_SHAPE, CHANGED_TELEPORT, CHANGED_TEXTURE, CHARACTER_ACCOUNT_FOR_SKIPPED_FRAMES, CHARACTER_AVOIDANCE_MODE, CHARACTER_CMD_JUMP, CHARACTER_CMD_SMOOTH_STOP, CHARACTER_CMD_STOP, CHARACTER_DESIRED_SPEED, CHARACTER_DESIRED_TURN_SPEED, CHARACTER_LENGTH, CHARACTER_MAX_ACCEL, CHARACTER_MAX_DECEL, CHARACTER_MAX_SPEED, CHARACTER_MAX_TURN_RADIUS, CHARACTER_ORIENTATION, CHARACTER_RADIUS, CHARACTER_STAY_WITHIN_PARCEL, CHARACTER_TYPE, CHARACTER_TYPE_A, CHARACTER_TYPE_B, CHARACTER_TYPE_C, CHARACTER_TYPE_D, CHARACTER_TYPE_NONE, CLICK_ACTION_BUY, CLICK_ACTION_DISABLED, CLICK_ACTION_IGNORE, CLICK_ACTION_NONE, CLICK_ACTION_OPEN, CLICK_ACTION_OPEN_MEDIA, CLICK_ACTION_PAY, CLICK_ACTION_PLAY, CLICK_ACTION_SIT, CLICK_ACTION_TOUCH, CLICK_ACTION_ZOOM, COMBAT_CHANNEL, COMBAT_LOG_ID, CONSTANT_TABLE, CONTENT_TYPE_ATOM, CONTENT_TYPE_FORM, CONTENT_TYPE_HTML, CONTENT_TYPE_JSON, CONTENT_TYPE_LLSD, CONTENT_TYPE_RSS, CONTENT_TYPE_TEXT, CONTENT_TYPE_XHTML, CONTENT_TYPE_XML, CONTROL_BACK, CONTROL_DOWN, CONTROL_FWD, CONTROL_LBUTTON, CONTROL_LEFT, CONTROL_ML_LBUTTON, CONTROL_RIGHT, CONTROL_ROT_LEFT, CONTROL_ROT_RIGHT, CONTROL_UP, type CallContext, type CallEntry, type ChatEntry, type ChatType, type ConstantEntry, CoverageCollector, type CoveragePlan, type CoverageReport, DAMAGEABLE, DAMAGE_TYPE_ACID, DAMAGE_TYPE_BLUDGEONING, DAMAGE_TYPE_COLD, DAMAGE_TYPE_ELECTRIC, DAMAGE_TYPE_EMOTIONAL, DAMAGE_TYPE_FIRE, DAMAGE_TYPE_FORCE, DAMAGE_TYPE_GENERIC, DAMAGE_TYPE_IMPACT, DAMAGE_TYPE_NECROTIC, DAMAGE_TYPE_PIERCING, DAMAGE_TYPE_POISON, DAMAGE_TYPE_PSYCHIC, DAMAGE_TYPE_RADIANT, DAMAGE_TYPE_SLASHING, DAMAGE_TYPE_SONIC, DATA_BORN, DATA_NAME, DATA_ONLINE, DATA_PAYINFO, DATA_RATING, DATA_SIM_POS, DATA_SIM_RATING, DATA_SIM_STATUS, DEBUG_CHANNEL, DEG_TO_RAD, DENSITY, DEREZ_DIE, DEREZ_MAKE_TEMP, ENVIRONMENT_DAYINFO, ENV_INVALID_AGENT, ENV_INVALID_RULE, ENV_NOT_EXPERIENCE, ENV_NO_ENVIRONMENT, ENV_NO_EXPERIENCE_LAND, ENV_NO_EXPERIENCE_PERMISSION, ENV_NO_PERMISSIONS, ENV_THROTTLE, ENV_VALIDATION_FAIL, EOF, ERR_GENERIC, ERR_MALFORMED_PARAMS, ERR_PARCEL_PERMISSIONS, ERR_RUNTIME_PERMISSIONS, ERR_THROTTLED, ESTATE_ACCESS_ALLOWED_AGENT_ADD, ESTATE_ACCESS_ALLOWED_AGENT_REMOVE, ESTATE_ACCESS_ALLOWED_GROUP_ADD, ESTATE_ACCESS_ALLOWED_GROUP_REMOVE, ESTATE_ACCESS_BANNED_AGENT_ADD, ESTATE_ACCESS_BANNED_AGENT_REMOVE, EVENT_SPECS, type EventName, type EventPayloads, type EventSpec, FALSE, FILTER_FLAGS, FILTER_FLAG_HUDS, FILTER_INCLUDE, FORCE_DIRECT_PATH, FRICTION, type FunctionHit, type FunctionInfo, type FunctionKind, GAME_CONTROL_AXIS_LEFTX, GAME_CONTROL_AXIS_LEFTY, GAME_CONTROL_AXIS_RIGHTX, GAME_CONTROL_AXIS_RIGHTY, GAME_CONTROL_AXIS_TRIGGERLEFT, GAME_CONTROL_AXIS_TRIGGERRIGHT, GAME_CONTROL_BUTTON_A, GAME_CONTROL_BUTTON_B, GAME_CONTROL_BUTTON_BACK, GAME_CONTROL_BUTTON_DPAD_DOWN, GAME_CONTROL_BUTTON_DPAD_LEFT, GAME_CONTROL_BUTTON_DPAD_RIGHT, GAME_CONTROL_BUTTON_DPAD_UP, GAME_CONTROL_BUTTON_GUIDE, GAME_CONTROL_BUTTON_LEFTSHOULDER, GAME_CONTROL_BUTTON_LEFTSTICK, GAME_CONTROL_BUTTON_MISC1, GAME_CONTROL_BUTTON_PADDLE1, GAME_CONTROL_BUTTON_PADDLE2, GAME_CONTROL_BUTTON_PADDLE3, GAME_CONTROL_BUTTON_PADDLE4, GAME_CONTROL_BUTTON_RIGHTSHOULDER, GAME_CONTROL_BUTTON_RIGHTSTICK, GAME_CONTROL_BUTTON_START, GAME_CONTROL_BUTTON_TOUCHPAD, GAME_CONTROL_BUTTON_X, GAME_CONTROL_BUTTON_Y, GCNP_RADIUS, GCNP_STATIC, GRAVITY_MULTIPLIER, HORIZONTAL, HTTP_ACCEPT, HTTP_BODY_MAXLENGTH, HTTP_BODY_TRUNCATED, HTTP_CUSTOM_HEADER, HTTP_EXTENDED_ERROR, HTTP_METHOD, HTTP_MIMETYPE, HTTP_PRAGMA_NO_CACHE, HTTP_USER_AGENT, HTTP_VERBOSE_THROTTLE, HTTP_VERIFY_CERT, IMG_USE_BAKED_AUX1, IMG_USE_BAKED_AUX2, IMG_USE_BAKED_AUX3, IMG_USE_BAKED_EYES, IMG_USE_BAKED_HAIR, IMG_USE_BAKED_HEAD, IMG_USE_BAKED_LEFTARM, IMG_USE_BAKED_LEFTLEG, IMG_USE_BAKED_LOWER, IMG_USE_BAKED_SKIRT, IMG_USE_BAKED_UPPER, INVENTORY_ALL, INVENTORY_ANIMATION, INVENTORY_BODYPART, INVENTORY_CLOTHING, INVENTORY_GESTURE, INVENTORY_LANDMARK, INVENTORY_MATERIAL, INVENTORY_NONE, INVENTORY_NOTECARD, INVENTORY_OBJECT, INVENTORY_SCRIPT, INVENTORY_SETTING, INVENTORY_SOUND, INVENTORY_TEXTURE, type InlineScriptInput, type InlineSource, type InventoryItem, InventoryType, type InventoryTypeValue, JSON_APPEND, JSON_ARRAY, JSON_DELETE, JSON_FALSE, JSON_INVALID, JSON_NULL, JSON_NUMBER, JSON_OBJECT, JSON_STRING, JSON_TRUE, KFM_CMD_PAUSE, KFM_CMD_PLAY, KFM_CMD_STOP, KFM_COMMAND, KFM_DATA, KFM_FORWARD, KFM_LOOP, KFM_MODE, KFM_PING_PONG, KFM_REVERSE, KFM_ROTATION, KFM_TRANSLATION, LAND_LARGE_BRUSH, LAND_LEVEL, LAND_LOWER, LAND_MEDIUM_BRUSH, LAND_NOISE, LAND_RAISE, LAND_REVERT, LAND_SMALL_BRUSH, LAND_SMOOTH, LINKSETDATA_DELETE, LINKSETDATA_EMEMORY, LINKSETDATA_ENOKEY, LINKSETDATA_EPROTECTED, LINKSETDATA_MULTIDELETE, LINKSETDATA_NOTFOUND, LINKSETDATA_NOUPDATE, LINKSETDATA_OK, LINKSETDATA_RESET, LINKSETDATA_UPDATE, LINK_ALL_CHILDREN, LINK_ALL_OTHERS, LINK_ROOT, LINK_SET, LINK_THIS, LIST_STAT_GEOMETRIC_MEAN, LIST_STAT_MAX, LIST_STAT_MEAN, LIST_STAT_MEDIAN, LIST_STAT_MIN, LIST_STAT_NUM_COUNT, LIST_STAT_RANGE, LIST_STAT_STD_DEV, LIST_STAT_SUM, LIST_STAT_SUM_SQUARES, LOOP, Linkset, type LinksetInput, type LinksetOptions, type LoadScriptInput, type LoadedLinkset, type LslType, type LslValue, MASK_BASE, MASK_EVERYONE, MASK_GROUP, MASK_NEXT, MASK_OWNER, NAK, NULL_KEY, OBJECT_ACCOUNT_LEVEL, OBJECT_ANIMATED_COUNT, OBJECT_ANIMATED_SLOTS_AVAILABLE, OBJECT_ATTACHED_POINT, OBJECT_ATTACHED_SLOTS_AVAILABLE, OBJECT_BODY_SHAPE_TYPE, OBJECT_CHARACTER_TIME, OBJECT_CLICK_ACTION, OBJECT_CREATION_TIME, OBJECT_CREATOR, OBJECT_DAMAGE, OBJECT_DAMAGE_TYPE, OBJECT_DESC, OBJECT_GROUP, OBJECT_GROUP_TAG, OBJECT_HEALTH, OBJECT_HOVER_HEIGHT, OBJECT_LAST_OWNER_ID, OBJECT_LINK_NUMBER, OBJECT_MASS, OBJECT_MATERIAL, OBJECT_NAME, OBJECT_OMEGA, OBJECT_OWNER, OBJECT_PATHFINDING_TYPE, OBJECT_PHANTOM, OBJECT_PHYSICS, OBJECT_PHYSICS_COST, OBJECT_POS, OBJECT_PRIM_COUNT, OBJECT_PRIM_EQUIVALENCE, OBJECT_RENDER_WEIGHT, OBJECT_RETURN_PARCEL, OBJECT_RETURN_PARCEL_OWNER, OBJECT_RETURN_REGION, OBJECT_REZZER_KEY, OBJECT_REZ_TIME, OBJECT_ROOT, OBJECT_ROT, OBJECT_RUNNING_SCRIPT_COUNT, OBJECT_SCALE, OBJECT_SCRIPT_MEMORY, OBJECT_SCRIPT_TIME, OBJECT_SELECT_COUNT, OBJECT_SERVER_COST, OBJECT_SIT_COUNT, OBJECT_STREAMING_COST, OBJECT_TEMP_ATTACHED, OBJECT_TEMP_ON_REZ, OBJECT_TEXT, OBJECT_TEXT_ALPHA, OBJECT_TEXT_COLOR, OBJECT_TOTAL_INVENTORY_COUNT, OBJECT_TOTAL_SCRIPT_COUNT, OBJECT_UNKNOWN_DETAIL, OBJECT_VELOCITY, OPT_AVATAR, OPT_CHARACTER, OPT_EXCLUSION_VOLUME, OPT_LEGACY_LINKSET, OPT_MATERIAL_VOLUME, OPT_OTHER, OPT_STATIC_OBSTACLE, OPT_WALKABLE, PARCEL_COUNT_GROUP, PARCEL_COUNT_OTHER, PARCEL_COUNT_OWNER, PARCEL_COUNT_SELECTED, PARCEL_COUNT_TEMP, PARCEL_COUNT_TOTAL, PARCEL_DETAILS_AREA, PARCEL_DETAILS_DESC, PARCEL_DETAILS_FLAGS, PARCEL_DETAILS_GROUP, PARCEL_DETAILS_ID, PARCEL_DETAILS_LANDING_LOOKAT, PARCEL_DETAILS_LANDING_POINT, PARCEL_DETAILS_NAME, PARCEL_DETAILS_OWNER, PARCEL_DETAILS_PRIM_CAPACITY, PARCEL_DETAILS_PRIM_USED, PARCEL_DETAILS_SCRIPT_DANGER, PARCEL_DETAILS_SEE_AVATARS, PARCEL_DETAILS_TP_ROUTING, PARCEL_FLAG_ALLOW_ALL_OBJECT_ENTRY, PARCEL_FLAG_ALLOW_CREATE_GROUP_OBJECTS, PARCEL_FLAG_ALLOW_CREATE_OBJECTS, PARCEL_FLAG_ALLOW_DAMAGE, PARCEL_FLAG_ALLOW_FLY, PARCEL_FLAG_ALLOW_GROUP_OBJECT_ENTRY, PARCEL_FLAG_ALLOW_GROUP_SCRIPTS, PARCEL_FLAG_ALLOW_LANDMARK, PARCEL_FLAG_ALLOW_SCRIPTS, PARCEL_FLAG_ALLOW_TERRAFORM, PARCEL_FLAG_LOCAL_SOUND_ONLY, PARCEL_FLAG_RESTRICT_PUSHOBJECT, PARCEL_FLAG_USE_ACCESS_GROUP, PARCEL_FLAG_USE_ACCESS_LIST, PARCEL_FLAG_USE_BAN_LIST, PARCEL_FLAG_USE_LAND_PASS_LIST, PARCEL_MEDIA_COMMAND_AGENT, PARCEL_MEDIA_COMMAND_AUTO_ALIGN, PARCEL_MEDIA_COMMAND_DESC, PARCEL_MEDIA_COMMAND_LOOP, PARCEL_MEDIA_COMMAND_LOOP_SET, PARCEL_MEDIA_COMMAND_PAUSE, PARCEL_MEDIA_COMMAND_PLAY, PARCEL_MEDIA_COMMAND_SIZE, PARCEL_MEDIA_COMMAND_STOP, PARCEL_MEDIA_COMMAND_TEXTURE, PARCEL_MEDIA_COMMAND_TIME, PARCEL_MEDIA_COMMAND_TYPE, PARCEL_MEDIA_COMMAND_UNLOAD, PARCEL_MEDIA_COMMAND_URL, PASSIVE, PASS_ALWAYS, PASS_IF_NOT_HANDLED, PASS_NEVER, PATROL_PAUSE_AT_WAYPOINTS, PAYMENT_INFO_ON_FILE, PAYMENT_INFO_USED, PAY_DEFAULT, PAY_HIDE, PERMISSION_ATTACH, PERMISSION_CHANGE_JOINTS, PERMISSION_CHANGE_LINKS, PERMISSION_CHANGE_PERMISSIONS, PERMISSION_CONTROL_CAMERA, PERMISSION_DEBIT, PERMISSION_OVERRIDE_ANIMATIONS, PERMISSION_RELEASE_OWNERSHIP, PERMISSION_REMAP_CONTROLS, PERMISSION_RETURN_OBJECTS, PERMISSION_SILENT_ESTATE_MANAGEMENT, PERMISSION_TAKE_CONTROLS, PERMISSION_TELEPORT, PERMISSION_TRACK_CAMERA, PERMISSION_TRIGGER_ANIMATION, PERM_ALL, PERM_COPY, PERM_MODIFY, PERM_MOVE, PERM_TRANSFER, PI, PING_PONG, PI_BY_TWO, PRIM_ALLOW_UNSIT, PRIM_ALPHA_MODE, PRIM_ALPHA_MODE_BLEND, PRIM_ALPHA_MODE_EMISSIVE, PRIM_ALPHA_MODE_MASK, PRIM_ALPHA_MODE_NONE, PRIM_BUMP_BARK, PRIM_BUMP_BLOBS, PRIM_BUMP_BRICKS, PRIM_BUMP_BRIGHT, PRIM_BUMP_CHECKER, PRIM_BUMP_CONCRETE, PRIM_BUMP_DARK, PRIM_BUMP_DISKS, PRIM_BUMP_GRAVEL, PRIM_BUMP_LARGETILE, PRIM_BUMP_NONE, PRIM_BUMP_SHINY, PRIM_BUMP_SIDING, PRIM_BUMP_STONE, PRIM_BUMP_STUCCO, PRIM_BUMP_SUCTION, PRIM_BUMP_TILE, PRIM_BUMP_WEAVE, PRIM_BUMP_WOOD, PRIM_CAST_SHADOWS, PRIM_CLICK_ACTION, PRIM_COLOR, PRIM_DAMAGE, PRIM_DESC, PRIM_FLEXIBLE, PRIM_FULLBRIGHT, PRIM_GLOW, PRIM_GLTF_ALPHA_MODE_BLEND, PRIM_GLTF_ALPHA_MODE_MASK, PRIM_GLTF_ALPHA_MODE_OPAQUE, PRIM_GLTF_BASE_COLOR, PRIM_GLTF_EMISSIVE, PRIM_GLTF_METALLIC_ROUGHNESS, PRIM_GLTF_NORMAL, PRIM_HEALTH, PRIM_HOLE_CIRCLE, PRIM_HOLE_DEFAULT, PRIM_HOLE_SQUARE, PRIM_HOLE_TRIANGLE, PRIM_LINK_TARGET, PRIM_MATERIAL, PRIM_MATERIAL_FLESH, PRIM_MATERIAL_GLASS, PRIM_MATERIAL_LIGHT, PRIM_MATERIAL_METAL, PRIM_MATERIAL_PLASTIC, PRIM_MATERIAL_RUBBER, PRIM_MATERIAL_STONE, PRIM_MATERIAL_WOOD, PRIM_MEDIA_ALT_IMAGE_ENABLE, PRIM_MEDIA_AUTO_LOOP, PRIM_MEDIA_AUTO_PLAY, PRIM_MEDIA_AUTO_SCALE, PRIM_MEDIA_AUTO_ZOOM, PRIM_MEDIA_CONTROLS, PRIM_MEDIA_CONTROLS_MINI, PRIM_MEDIA_CONTROLS_STANDARD, PRIM_MEDIA_CURRENT_URL, PRIM_MEDIA_FIRST_CLICK_INTERACT, PRIM_MEDIA_HEIGHT_PIXELS, PRIM_MEDIA_HOME_URL, PRIM_MEDIA_MAX_HEIGHT_PIXELS, PRIM_MEDIA_MAX_URL_LENGTH, PRIM_MEDIA_MAX_WHITELIST_COUNT, PRIM_MEDIA_MAX_WHITELIST_SIZE, PRIM_MEDIA_MAX_WIDTH_PIXELS, PRIM_MEDIA_PARAM_MAX, PRIM_MEDIA_PERMS_CONTROL, PRIM_MEDIA_PERMS_INTERACT, PRIM_MEDIA_PERM_ANYONE, PRIM_MEDIA_PERM_GROUP, PRIM_MEDIA_PERM_NONE, PRIM_MEDIA_PERM_OWNER, PRIM_MEDIA_WHITELIST, PRIM_MEDIA_WHITELIST_ENABLE, PRIM_MEDIA_WIDTH_PIXELS, PRIM_NAME, PRIM_NORMAL, PRIM_OMEGA, PRIM_PHANTOM, PRIM_PHYSICS, PRIM_PHYSICS_SHAPE_CONVEX, PRIM_PHYSICS_SHAPE_NONE, PRIM_PHYSICS_SHAPE_PRIM, PRIM_PHYSICS_SHAPE_TYPE, PRIM_POINT_LIGHT, PRIM_POSITION, PRIM_POS_LOCAL, PRIM_PROJECTOR, PRIM_REFLECTION_PROBE, PRIM_REFLECTION_PROBE_BOX, PRIM_REFLECTION_PROBE_DYNAMIC, PRIM_REFLECTION_PROBE_MIRROR, PRIM_RENDER_MATERIAL, PRIM_ROTATION, PRIM_ROT_LOCAL, PRIM_SCRIPTED_SIT_ONLY, PRIM_SCULPT_FLAG_ANIMESH, PRIM_SCULPT_FLAG_INVERT, PRIM_SCULPT_FLAG_MIRROR, PRIM_SCULPT_TYPE_CYLINDER, PRIM_SCULPT_TYPE_MASK, PRIM_SCULPT_TYPE_MESH, PRIM_SCULPT_TYPE_PLANE, PRIM_SCULPT_TYPE_SPHERE, PRIM_SCULPT_TYPE_TORUS, PRIM_SHINY_HIGH, PRIM_SHINY_LOW, PRIM_SHINY_MEDIUM, PRIM_SHINY_NONE, PRIM_SIT_FLAGS, PRIM_SIT_TARGET, PRIM_SIZE, PRIM_SLICE, PRIM_SPECULAR, PRIM_TEMP_ON_REZ, PRIM_TEXGEN, PRIM_TEXGEN_DEFAULT, PRIM_TEXGEN_PLANAR, PRIM_TEXT, PRIM_TEXTURE, PRIM_TYPE, PRIM_TYPE_BOX, PRIM_TYPE_CYLINDER, PRIM_TYPE_PRISM, PRIM_TYPE_RING, PRIM_TYPE_SCULPT, PRIM_TYPE_SPHERE, PRIM_TYPE_TORUS, PRIM_TYPE_TUBE, PROFILE_NONE, PROFILE_SCRIPT_MEMORY, PSYS_PART_BF_DEST_COLOR, PSYS_PART_BF_ONE, PSYS_PART_BF_ONE_MINUS_DEST_COLOR, PSYS_PART_BF_ONE_MINUS_SOURCE_ALPHA, PSYS_PART_BF_ONE_MINUS_SOURCE_COLOR, PSYS_PART_BF_SOURCE_ALPHA, PSYS_PART_BF_SOURCE_COLOR, PSYS_PART_BF_ZERO, PSYS_PART_BLEND_FUNC_DEST, PSYS_PART_BLEND_FUNC_SOURCE, PSYS_PART_BOUNCE_MASK, PSYS_PART_EMISSIVE_MASK, PSYS_PART_END_ALPHA, PSYS_PART_END_COLOR, PSYS_PART_END_GLOW, PSYS_PART_END_SCALE, PSYS_PART_FLAGS, PSYS_PART_FOLLOW_SRC_MASK, PSYS_PART_FOLLOW_VELOCITY_MASK, PSYS_PART_INTERP_COLOR_MASK, PSYS_PART_INTERP_SCALE_MASK, PSYS_PART_MAX_AGE, PSYS_PART_RIBBON_MASK, PSYS_PART_START_ALPHA, PSYS_PART_START_COLOR, PSYS_PART_START_GLOW, PSYS_PART_START_SCALE, PSYS_PART_TARGET_LINEAR_MASK, PSYS_PART_TARGET_POS_MASK, PSYS_PART_WIND_MASK, PSYS_SRC_ACCEL, PSYS_SRC_ANGLE_BEGIN, PSYS_SRC_ANGLE_END, PSYS_SRC_BURST_PART_COUNT, PSYS_SRC_BURST_RADIUS, PSYS_SRC_BURST_RATE, PSYS_SRC_BURST_SPEED_MAX, PSYS_SRC_BURST_SPEED_MIN, PSYS_SRC_INNERANGLE, PSYS_SRC_MAX_AGE, PSYS_SRC_OBJ_REL_MASK, PSYS_SRC_OMEGA, PSYS_SRC_OUTERANGLE, PSYS_SRC_PATTERN, PSYS_SRC_PATTERN_ANGLE, PSYS_SRC_PATTERN_ANGLE_CONE, PSYS_SRC_PATTERN_ANGLE_CONE_EMPTY, PSYS_SRC_PATTERN_DROP, PSYS_SRC_PATTERN_EXPLODE, PSYS_SRC_TARGET_KEY, PSYS_SRC_TEXTURE, PUBLIC_CHANNEL, PURSUIT_FUZZ_FACTOR, PURSUIT_GOAL_TOLERANCE, PURSUIT_INTERCEPT, PURSUIT_OFFSET, PU_EVADE_HIDDEN, PU_EVADE_SPOTTED, PU_FAILURE_DYNAMIC_PATHFINDING_DISABLED, PU_FAILURE_INVALID_GOAL, PU_FAILURE_INVALID_START, PU_FAILURE_NO_NAVMESH, PU_FAILURE_NO_VALID_DESTINATION, PU_FAILURE_OTHER, PU_FAILURE_PARCEL_UNREACHABLE, PU_FAILURE_TARGET_GONE, PU_FAILURE_UNREACHABLE, PU_GOAL_REACHED, PU_SLOWDOWN_DISTANCE_REACHED, type ParamSpec, type PermMask, Prim, type PrimInput, type PrimOptions, RAD_TO_DEG, RCERR_CAST_TIME_EXCEEDED, RCERR_SIM_PERF_LOW, RCERR_UNKNOWN, RC_DATA_FLAGS, RC_DETECT_PHANTOM, RC_GET_LINK_NUM, RC_GET_NORMAL, RC_GET_ROOT_KEY, RC_MAX_HITS, RC_REJECT_AGENTS, RC_REJECT_LAND, RC_REJECT_NONPHYSICAL, RC_REJECT_PHYSICAL, RC_REJECT_TYPES, REGION_FLAG_ALLOW_DAMAGE, REGION_FLAG_ALLOW_DIRECT_TELEPORT, REGION_FLAG_BLOCK_FLY, REGION_FLAG_BLOCK_FLYOVER, REGION_FLAG_BLOCK_TERRAFORM, REGION_FLAG_DISABLE_COLLISIONS, REGION_FLAG_DISABLE_PHYSICS, REGION_FLAG_FIXED_SUN, REGION_FLAG_RESTRICT_PUSHOBJECT, REGION_FLAG_SANDBOX, REMOTE_DATA_CHANNEL, REMOTE_DATA_REPLY, REMOTE_DATA_REQUEST, REQUIRE_LINE_OF_SIGHT, RESTITUTION, REVERSE, REZ_ACCEL, REZ_DAMAGE, REZ_DAMAGE_TYPE, REZ_FLAGS, REZ_FLAG_BLOCK_GRAB_OBJECT, REZ_FLAG_DIE_ON_COLLIDE, REZ_FLAG_DIE_ON_NOENTRY, REZ_FLAG_NO_COLLIDE_FAMILY, REZ_FLAG_NO_COLLIDE_OWNER, REZ_FLAG_PHANTOM, REZ_FLAG_PHYSICAL, REZ_FLAG_TEMP, REZ_LOCK_AXES, REZ_OMEGA, REZ_PARAM, REZ_PARAM_STRING, REZ_POS, REZ_ROT, REZ_SOUND, REZ_SOUND_COLLIDE, REZ_VEL, ROTATE, type Rotation, SCALE, SCRIPTED, SIM_STAT_ACTIVE_SCRIPT_COUNT, SIM_STAT_AGENT_COUNT, SIM_STAT_AGENT_MS, SIM_STAT_AGENT_UPDATES, SIM_STAT_AI_MS, SIM_STAT_ASSET_DOWNLOADS, SIM_STAT_ASSET_UPLOADS, SIM_STAT_CHILD_AGENT_COUNT, SIM_STAT_FRAME_MS, SIM_STAT_IMAGE_MS, SIM_STAT_IO_PUMP_MS, SIM_STAT_NET_MS, SIM_STAT_OTHER_MS, SIM_STAT_PACKETS_IN, SIM_STAT_PACKETS_OUT, SIM_STAT_PCT_CHARS_STEPPED, SIM_STAT_PHYSICS_FPS, SIM_STAT_PHYSICS_MS, SIM_STAT_PHYSICS_OTHER_MS, SIM_STAT_PHYSICS_SHAPE_MS, SIM_STAT_PHYSICS_STEP_MS, SIM_STAT_SCRIPT_EPS, SIM_STAT_SCRIPT_MS, SIM_STAT_SCRIPT_RUN_PCT, SIM_STAT_SLEEP_MS, SIM_STAT_SPARE_MS, SIM_STAT_UNACKED_BYTES, SIT_FLAG_ALLOW_UNSIT, SIT_FLAG_NO_COLLIDE, SIT_FLAG_NO_DAMAGE, SIT_FLAG_SCRIPTED_ONLY, SIT_FLAG_SIT_TARGET, SIT_INVALID_AGENT, SIT_INVALID_LINK, SIT_INVALID_OBJECT, SIT_NOT_EXPERIENCE, SIT_NO_ACCESS, SIT_NO_EXPERIENCE_PERMISSION, SIT_NO_SIT_TARGET, SKY_ABSORPTION_CONFIG, SKY_AMBIENT, SKY_BLUE, SKY_CLOUDS, SKY_CLOUD_TEXTURE, SKY_DENSITY_PROFILE_COUNTS, SKY_DOME, SKY_GAMMA, SKY_GLOW, SKY_HAZE, SKY_LIGHT, SKY_MIE_CONFIG, SKY_MOON, SKY_MOON_TEXTURE, SKY_PLANET, SKY_RAYLEIGH_CONFIG, SKY_REFLECTION_PROBE_AMBIANCE, SKY_REFRACTION, SKY_STAR_BRIGHTNESS, SKY_SUN, SKY_SUN_TEXTURE, SKY_TEXTURE_DEFAULTS, SKY_TRACKS, SMOOTH, SOUND_LOOP, SOUND_PLAY, SOUND_SYNC, SOUND_TRIGGER, SQRT2, STATUS_BLOCK_GRAB, STATUS_BLOCK_GRAB_OBJECT, STATUS_BOUNDS_ERROR, STATUS_CAST_SHADOWS, STATUS_DIE_AT_EDGE, STATUS_DIE_AT_NO_ENTRY, STATUS_INTERNAL_ERROR, STATUS_MALFORMED_PARAMS, STATUS_NOT_FOUND, STATUS_NOT_SUPPORTED, STATUS_OK, STATUS_PHANTOM, STATUS_PHYSICS, STATUS_RETURN_AT_EDGE, STATUS_ROTATE_X, STATUS_ROTATE_Y, STATUS_ROTATE_Z, STATUS_SANDBOX, STATUS_TYPE_MISMATCH, STATUS_WHITELIST_FAILED, STRING_TRIM, STRING_TRIM_HEAD, STRING_TRIM_TAIL, Script, type ScriptInput, type ScriptOptions, type ScriptSource, type ScriptState, type StateHit, type StateInfo, type StatementHit, type StatementInfo, type StatementKind, TARGETED_EMAIL_OBJECT_OWNER, TARGETED_EMAIL_ROOT_CREATOR, TEXTURE_BLANK, TEXTURE_DEFAULT, TEXTURE_MEDIA, TEXTURE_PLYWOOD, TEXTURE_TRANSPARENT, TOUCH_INVALID_FACE, TOUCH_INVALID_TEXCOORD, TOUCH_INVALID_VECTOR, TP_ROUTING_BLOCKED, TP_ROUTING_FREE, TP_ROUTING_LANDINGP, TRANSFER_BAD_OPTS, TRANSFER_BAD_ROOT, TRANSFER_DEST, TRANSFER_FLAGS, TRANSFER_FLAG_COPY, TRANSFER_FLAG_RESERVED, TRANSFER_FLAG_TAKE, TRANSFER_NO_ATTACHMENT, TRANSFER_NO_ITEMS, TRANSFER_NO_PERMS, TRANSFER_NO_TARGET, TRANSFER_OK, TRANSFER_THROTTLE, TRAVERSAL_TYPE, TRAVERSAL_TYPE_FAST, TRAVERSAL_TYPE_NONE, TRAVERSAL_TYPE_SLOW, TRUE, TWO_PI, TYPE_FLOAT, TYPE_INTEGER, TYPE_INVALID, TYPE_KEY, TYPE_ROTATION, TYPE_STRING, TYPE_VECTOR, URL_REQUEST_DENIED, URL_REQUEST_GRANTED, VEHICLE_ANGULAR_DEFLECTION_EFFICIENCY, VEHICLE_ANGULAR_DEFLECTION_TIMESCALE, VEHICLE_ANGULAR_FRICTION_TIMESCALE, VEHICLE_ANGULAR_MOTOR_DECAY_TIMESCALE, VEHICLE_ANGULAR_MOTOR_DIRECTION, VEHICLE_ANGULAR_MOTOR_TIMESCALE, VEHICLE_BANKING_EFFICIENCY, VEHICLE_BANKING_MIX, VEHICLE_BANKING_TIMESCALE, VEHICLE_BUOYANCY, VEHICLE_FLAG_BLOCK_INTERFERENCE, VEHICLE_FLAG_CAMERA_DECOUPLED, VEHICLE_FLAG_HOVER_GLOBAL_HEIGHT, VEHICLE_FLAG_HOVER_TERRAIN_ONLY, VEHICLE_FLAG_HOVER_UP_ONLY, VEHICLE_FLAG_HOVER_WATER_ONLY, VEHICLE_FLAG_LIMIT_MOTOR_UP, VEHICLE_FLAG_LIMIT_ROLL_ONLY, VEHICLE_FLAG_MOUSELOOK_BANK, VEHICLE_FLAG_MOUSELOOK_STEER, VEHICLE_FLAG_NO_DEFLECTION_UP, VEHICLE_FLAG_NO_FLY_UP, VEHICLE_HOVER_EFFICIENCY, VEHICLE_HOVER_HEIGHT, VEHICLE_HOVER_TIMESCALE, VEHICLE_LINEAR_DEFLECTION_EFFICIENCY, VEHICLE_LINEAR_DEFLECTION_TIMESCALE, VEHICLE_LINEAR_FRICTION_TIMESCALE, VEHICLE_LINEAR_MOTOR_DECAY_TIMESCALE, VEHICLE_LINEAR_MOTOR_DIRECTION, VEHICLE_LINEAR_MOTOR_OFFSET, VEHICLE_LINEAR_MOTOR_TIMESCALE, VEHICLE_REFERENCE_FRAME, VEHICLE_TYPE_AIRPLANE, VEHICLE_TYPE_BALLOON, VEHICLE_TYPE_BOAT, VEHICLE_TYPE_CAR, VEHICLE_TYPE_NONE, VEHICLE_TYPE_SLED, VEHICLE_VERTICAL_ATTRACTION_EFFICIENCY, VEHICLE_VERTICAL_ATTRACTION_TIMESCALE, VERTICAL, type Vector, WANDER_PAUSE_AT_WAYPOINTS, WATER_BLUR_MULTIPLIER, WATER_FOG, WATER_FRESNEL, WATER_NORMAL_SCALE, WATER_NORMAL_TEXTURE, WATER_REFRACTION, WATER_TEXTURE_DEFAULTS, WATER_WAVE_DIRECTION, XP_ERROR_EXPERIENCES_DISABLED, XP_ERROR_EXPERIENCE_DISABLED, XP_ERROR_EXPERIENCE_SUSPENDED, XP_ERROR_INVALID_EXPERIENCE, XP_ERROR_INVALID_PARAMETERS, XP_ERROR_KEY_NOT_FOUND, XP_ERROR_MATURITY_EXCEEDED, XP_ERROR_NONE, XP_ERROR_NOT_FOUND, XP_ERROR_NOT_PERMITTED, XP_ERROR_NOT_PERMITTED_LAND, XP_ERROR_NO_EXPERIENCE, XP_ERROR_QUOTA_EXCEEDED, XP_ERROR_REQUEST_PERM_TIMEOUT, XP_ERROR_RETRY_UPDATE, XP_ERROR_STORAGE_EXCEPTION, XP_ERROR_STORE_DISABLED, XP_ERROR_THROTTLED, XP_ERROR_UNKNOWN_ERROR, ZERO_ROTATION, ZERO_VECTOR, buildCoveragePlan, defaultValueFor, loadLinkset, loadScript, makeInventoryItem, mergeReports };
