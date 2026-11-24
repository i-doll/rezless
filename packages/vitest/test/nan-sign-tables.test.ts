import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

// In-world (Aditi, SLua Tideland, 2026-11-24), Mono. The two scripts below ran in-world as they
// are here, printing their results with llOwnerSay; the tables are what they printed.

/** Every `key=value` the script said, in order. */
async function results(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s.chat.flatMap((c) => c.text.split(' ')).filter((w) => w.includes('='))
}

/** The entries of a table written as space-separated `key=value` lines. */
const entries = (lines: string[]) => lines.flatMap((l) => l.split(' '))

describe('the NaN sign through rotation products and divisions, pair by pair', () => {
  // For op 0 (rotation / rotation), 1 (rotation * rotation), 2 (vector / rotation) and 3
  // (vector * rotation), two parts p and q of the operands (the left operand's first, then the
  // right one's x, y, z, s) were set to N or P (the two letters after p and q), the rest to plain
  // numbers. Each result part prints as - for -nan, + for nan and 0 for a number. The products
  // follow the float rule (two NaNs give -nan only when both are negative); a division passes on
  // the first NaN it meets, in an order of its own for each part.
  const PAIRS = `float P; float N;
string buf;
emit(string s) { buf += " " + s; if (llStringLength(buf) > 900) { llSay(0, buf); buf = ""; } }
string sgn(list l) {
  string o; integer i; integer n = llGetListLength(l);
  for (i = 0; i < n; i++) {
    float f = llList2Float(l, i);
    if (f == f) o += "0"; else if (llGetSubString(llList2CSV([f]), 0, 0) == "-") o += "-"; else o += "+";
  }
  return o;
}
list base(integer n, float rest, float s) { if (n == 3) return [rest, rest + 1.0, rest + 2.0]; return [rest, rest + 0.125, rest + 0.0625, s]; }
default {
  state_entry() {
    P = (float)"nan"; N = (float)"-nan";
    list sg = [N, P]; list nm = ["N", "P"];
    integer op; integer p; integer q; integer u; integer w;
    for (op = 0; op < 4; op++) {
      integer na = 4; if (op >= 2) na = 3;
      integer total = na + 4;
      for (p = 0; p < total; p++) for (q = p + 1; q < total; q++) for (u = 0; u < 2; u++) for (w = 0; w < 2; w++) {
        list A = base(na, 0.5, 0.5); list B = base(4, 0.25, 0.75);
        if (p < na) A = llListReplaceList(A, [llList2Float(sg, u)], p, p); else B = llListReplaceList(B, [llList2Float(sg, u)], p - na, p - na);
        if (q < na) A = llListReplaceList(A, [llList2Float(sg, w)], q, q); else B = llListReplaceList(B, [llList2Float(sg, w)], q - na, q - na);
        rotation RB = <llList2Float(B, 0), llList2Float(B, 1), llList2Float(B, 2), llList2Float(B, 3)>;
        string r;
        if (op < 2) {
          rotation RA = <llList2Float(A, 0), llList2Float(A, 1), llList2Float(A, 2), llList2Float(A, 3)>;
          rotation X; if (op == 0) X = RA / RB; else X = RA * RB;
          r = sgn([X.x, X.y, X.z, X.s]);
        } else {
          vector VA = <llList2Float(A, 0), llList2Float(A, 1), llList2Float(A, 2)>;
          vector Y; if (op == 2) Y = VA / RB; else Y = VA * RB;
          r = sgn([Y.x, Y.y, Y.z]);
        }
        emit((string)op + (string)p + (string)q + llList2String(nm, u) + llList2String(nm, w) + "=" + r);
      }
    }
    llSay(0, buf);
  }
}`

  const IN_WORLD = [
    '001NN=---- 001NP=--+- 001PN=++-+ 001PP=++++ 002NN=---- 002NP=--+- 002PN=++-+ 002PP=++++ 003NN=---- 003NP=+-++ 003PN=-+-- 003PP=++++',
    '004NN=+-+- 004NP=---- 004PN=++++ 004PP=-+-+ 005NN=---- 005NP=---- 005PN=++++ 005PP=++++ 006NN=--+- 006NP=---- 006PN=++++ 006PP=++-+',
    '007NN=---- 007NP=+-++ 007PN=-+-- 007PP=++++ 012NN=---- 012NP=+-+- 012PN=-+-+ 012PP=++++ 013NN=---- 013NP=+-++ 013PN=-+-- 013PP=++++',
    '014NN=+-++ 014NP=---- 014PN=++++ 014PP=-+-- 015NN=+--+ 015NP=---- 015PN=++++ 015PP=-++- 016NN=-++- 016NP=---- 016PN=++++ 016PP=+--+',
    '017NN=---- 017NP=+-++ 017PN=-+-- 017PP=++++ 023NN=---- 023NP=++++ 023PN=---- 023PP=++++ 024NN=+--+ 024NP=---- 024PN=++++ 024PP=-++-',
    '025NN=++-+ 025NP=---- 025PN=++++ 025PP=--+- 026NN=-++- 026NP=---- 026PN=++++ 026PP=+--+ 027NN=---- 027NP=++++ 027PN=---- 027PP=++++',
    '034NN=+--- 034NP=---- 034PN=++++ 034PP=-+++ 035NN=---- 035NP=---- 035PN=++++ 035PP=++++ 036NN=-+-- 036NP=---- 036PN=++++ 036PP=+-++',
    '037NN=---- 037NP=-+-+ 037PN=+-+- 037PP=++++ 045NN=++++ 045NP=+-++ 045PN=-+-- 045PP=---- 046NN=++++ 046NP=+--+ 046PN=-++- 046PP=----',
    '047NN=+--- 047NP=++++ 047PN=---- 047PP=-+++ 056NN=++++ 056NP=+--+ 056PN=-++- 056PP=---- 057NN=---- 057NP=++++ 057PN=---- 057PP=++++',
    '067NN=-++- 067NP=++++ 067PN=---- 067PP=+--+',
    '101NN=---- 101NP=++++ 101PN=++++ 101PP=++++ 102NN=---- 102NP=++++ 102PN=++++ 102PP=++++ 103NN=---- 103NP=++++ 103PN=++++ 103PP=++++',
    '104NN=---- 104NP=++++ 104PN=++++ 104PP=++++ 105NN=---- 105NP=++++ 105PN=++++ 105PP=++++ 106NN=---- 106NP=++++ 106PN=++++ 106PP=++++',
    '107NN=---- 107NP=++++ 107PN=++++ 107PP=++++ 112NN=---- 112NP=++++ 112PN=++++ 112PP=++++ 113NN=---- 113NP=++++ 113PN=++++ 113PP=++++',
    '114NN=---- 114NP=++++ 114PN=++++ 114PP=++++ 115NN=---- 115NP=++++ 115PN=++++ 115PP=++++ 116NN=---- 116NP=++++ 116PN=++++ 116PP=++++',
    '117NN=---- 117NP=++++ 117PN=++++ 117PP=++++ 123NN=---- 123NP=++++ 123PN=++++ 123PP=++++ 124NN=---- 124NP=++++ 124PN=++++ 124PP=++++',
    '125NN=---- 125NP=++++ 125PN=++++ 125PP=++++ 126NN=---- 126NP=++++ 126PN=++++ 126PP=++++ 127NN=---- 127NP=++++ 127PN=++++ 127PP=++++',
    '134NN=---- 134NP=++++ 134PN=++++ 134PP=++++ 135NN=---- 135NP=++++ 135PN=++++ 135PP=++++ 136NN=---- 136NP=++++ 136PN=++++ 136PP=++++',
    '137NN=---- 137NP=++++ 137PN=++++ 137PP=++++ 145NN=---- 145NP=++++ 145PN=++++ 145PP=++++ 146NN=---- 146NP=++++ 146PN=++++ 146PP=++++',
    '147NN=---- 147NP=++++ 147PN=++++ 147PP=++++ 156NN=---- 156NP=++++ 156PN=++++ 156PP=++++ 157NN=---- 157NP=++++ 157PN=++++ 157PP=++++',
    '167NN=---- 167NP=++++ 167PN=++++ 167PP=++++',
    '201NN=--- 201NP=+-- 201PN=-++ 201PP=+++ 202NN=--- 202NP=++- 202PN=--+ 202PP=+++ 203NN=+-- 203NP=--- 203PN=+++ 203PP=-++',
    '204NN=++- 204NP=--- 204PN=+++ 204PP=--+ 205NN=-+- 205NP=--- 205PN=+++ 205PP=+-+ 206NN=--- 206NP=+-- 206PN=-++ 206PP=+++',
    '212NN=--- 212NP=++- 212PN=--+ 212PP=+++ 213NN=+-- 213NP=--- 213PN=+++ 213PP=-++ 214NN=++- 214NP=--- 214PN=+++ 214PP=--+',
    '215NN=-++ 215NP=--- 215PN=+++ 215PP=+-- 216NN=--- 216NP=++- 216PN=--+ 216PP=+++ 223NN=--+ 223NP=--- 223PN=+++ 223PP=++-',
    '224NN=++- 224NP=--- 224PN=+++ 224PP=--+ 225NN=-++ 225NP=--- 225PN=+++ 225PP=+-- 226NN=--- 226NP=--+ 226PN=++- 226PP=+++',
    '234NN=+++ 234NP=--+ 234PN=++- 234PP=--- 235NN=+++ 235NP=+-- 235PN=-++ 235PP=--- 236NN=--- 236NP=+++ 236PN=--- 236PP=+++',
    '245NN=+++ 245NP=+-- 245PN=-++ 245PP=--- 246NN=++- 246NP=+++ 246PN=--- 246PP=--+ 256NN=-++ 256NP=+++ 256PN=--- 256PP=+--',
    '301NN=--- 301NP=+++ 301PN=+++ 301PP=+++ 302NN=--- 302NP=+++ 302PN=+++ 302PP=+++ 303NN=--- 303NP=+++ 303PN=+++ 303PP=+++',
    '304NN=--- 304NP=+++ 304PN=+++ 304PP=+++ 305NN=--- 305NP=+++ 305PN=+++ 305PP=+++ 306NN=--- 306NP=+++ 306PN=+++ 306PP=+++',
    '312NN=--- 312NP=+++ 312PN=+++ 312PP=+++ 313NN=--- 313NP=+++ 313PN=+++ 313PP=+++ 314NN=--- 314NP=+++ 314PN=+++ 314PP=+++',
    '315NN=--- 315NP=+++ 315PN=+++ 315PP=+++ 316NN=--- 316NP=+++ 316PN=+++ 316PP=+++ 323NN=--- 323NP=+++ 323PN=+++ 323PP=+++',
    '324NN=--- 324NP=+++ 324PN=+++ 324PP=+++ 325NN=--- 325NP=+++ 325PN=+++ 325PP=+++ 326NN=--- 326NP=+++ 326PN=+++ 326PP=+++',
    '334NN=--- 334NP=+++ 334PN=+++ 334PP=+++ 335NN=--- 335NP=+++ 335PN=+++ 335PP=+++ 336NN=--- 336NP=+++ 336PN=+++ 336PP=+++',
    '345NN=--- 345NP=+++ 345PN=+++ 345PP=+++ 346NN=--- 346NP=+++ 346PN=+++ 346PP=+++ 356NN=--- 356NP=+++ 356PN=+++ 356PP=+++',
  ]

  it('gives the signs measured for every pair of NaNs', async () => {
    expect(await results(PAIRS)).toEqual(entries(IN_WORLD))
  })
})

describe('MEDIAN of a list holding a NaN', () => {
  // Each case is a list written one character a number: 1 to 9 and a to q are 1.0 to 26.0, N is
  // -nan and P nan. All orders of 12N, 1PN, 123N, 12PN, 1234N and 123PN, and lists of 7 to 25
  // numbers with one NaN. Each one's median matches an insertion sort on <.
  const IN_WORLD = [
    '12N=2.000000 1N2=-nan 21N=2.000000 2N1=-nan N12=1.000000 N21=1.000000 1PN=nan 1NP=-nan P1N=1.000000 PN1=-nan',
    'N1P=1.000000 NP1=nan 123N=2.500000 12N3=-nan 132N=2.500000 13N2=-nan 1N23=-nan 1N32=-nan 213N=2.500000 21N3=-nan',
    '231N=2.500000 23N1=-nan 2N13=-nan 2N31=-nan 312N=2.500000 31N2=-nan 321N=2.500000 32N1=-nan 3N12=-nan 3N21=-nan',
    'N123=1.500000 N132=1.500000 N213=1.500000 N231=1.500000 N312=1.500000 N321=1.500000 12PN=nan 12NP=-nan 1P2N=nan 1PN2=-nan',
    '1N2P=-nan 1NP2=nan 21PN=nan 21NP=-nan 2P1N=nan 2PN1=-nan 2N1P=-nan 2NP1=nan P12N=1.500000 P1N2=-nan',
    'P21N=1.500000 P2N1=-nan PN12=-nan PN21=-nan N12P=1.500000 N1P2=nan N21P=1.500000 N2P1=nan NP12=nan NP21=nan',
    '1234N=3.000000 123N4=3.000000 1243N=3.000000 124N3=4.000000 12N34=-nan 12N43=-nan 1324N=3.000000 132N4=3.000000 1342N=3.000000 134N2=4.000000',
    '13N24=-nan 13N42=-nan 1423N=3.000000 142N3=4.000000 1432N=3.000000 143N2=4.000000 14N23=-nan 14N32=-nan 1N234=2.000000 1N243=2.000000',
    '1N324=2.000000 1N342=2.000000 1N423=2.000000 1N432=2.000000 2134N=3.000000 213N4=3.000000 2143N=3.000000 214N3=4.000000 21N34=-nan 21N43=-nan',
    '2314N=3.000000 231N4=3.000000 2341N=3.000000 234N1=4.000000 23N14=-nan 23N41=-nan 2413N=3.000000 241N3=4.000000 2431N=3.000000 243N1=4.000000',
    '24N13=-nan 24N31=-nan 2N134=1.000000 2N143=1.000000 2N314=1.000000 2N341=1.000000 2N413=1.000000 2N431=1.000000 3124N=3.000000 312N4=3.000000',
    '3142N=3.000000 314N2=4.000000 31N24=-nan 31N42=-nan 3214N=3.000000 321N4=3.000000 3241N=3.000000 324N1=4.000000 32N14=-nan 32N41=-nan',
    '3412N=3.000000 341N2=4.000000 3421N=3.000000 342N1=4.000000 34N12=-nan 34N21=-nan 3N124=1.000000 3N142=1.000000 3N214=1.000000 3N241=1.000000',
    '3N412=1.000000 3N421=1.000000 4123N=3.000000 412N3=4.000000 4132N=3.000000 413N2=4.000000 41N23=-nan 41N32=-nan 4213N=3.000000 421N3=4.000000',
    '4231N=3.000000 423N1=4.000000 42N13=-nan 42N31=-nan 4312N=3.000000 431N2=4.000000 4321N=3.000000 432N1=4.000000 43N12=-nan 43N21=-nan',
    '4N123=1.000000 4N132=1.000000 4N213=1.000000 4N231=1.000000 4N312=1.000000 4N321=1.000000 N1234=2.000000 N1243=2.000000 N1324=2.000000 N1342=2.000000',
    'N1423=2.000000 N1432=2.000000 N2134=2.000000 N2143=2.000000 N2314=2.000000 N2341=2.000000 N2413=2.000000 N2431=2.000000 N3124=2.000000 N3142=2.000000',
    'N3214=2.000000 N3241=2.000000 N3412=2.000000 N3421=2.000000 N4123=2.000000 N4132=2.000000 N4213=2.000000 N4231=2.000000 N4312=2.000000 N4321=2.000000',
    '123PN=3.000000 123NP=3.000000 12P3N=nan 12PN3=nan 12N3P=-nan 12NP3=-nan 132PN=3.000000 132NP=3.000000 13P2N=nan 13PN2=nan',
    '13N2P=-nan 13NP2=-nan 1P23N=2.000000 1P2N3=2.000000 1P32N=2.000000 1P3N2=3.000000 1PN23=-nan 1PN32=-nan 1N23P=2.000000 1N2P3=2.000000',
    '1N32P=2.000000 1N3P2=3.000000 1NP23=nan 1NP32=nan 213PN=3.000000 213NP=3.000000 21P3N=nan 21PN3=nan 21N3P=-nan 21NP3=-nan',
    '231PN=3.000000 231NP=3.000000 23P1N=nan 23PN1=nan 23N1P=-nan 23NP1=-nan 2P13N=1.000000 2P1N3=1.000000 2P31N=1.000000 2P3N1=3.000000',
    '2PN13=-nan 2PN31=-nan 2N13P=1.000000 2N1P3=1.000000 2N31P=1.000000 2N3P1=3.000000 2NP13=nan 2NP31=nan 312PN=3.000000 312NP=3.000000',
    '31P2N=nan 31PN2=nan 31N2P=-nan 31NP2=-nan 321PN=3.000000 321NP=3.000000 32P1N=nan 32PN1=nan 32N1P=-nan 32NP1=-nan',
    '3P12N=1.000000 3P1N2=1.000000 3P21N=1.000000 3P2N1=2.000000 3PN12=-nan 3PN21=-nan 3N12P=1.000000 3N1P2=1.000000 3N21P=1.000000 3N2P1=2.000000',
    '3NP12=nan 3NP21=nan P123N=2.000000 P12N3=2.000000 P132N=2.000000 P13N2=3.000000 P1N23=-nan P1N32=-nan P213N=2.000000 P21N3=2.000000',
    'P231N=2.000000 P23N1=3.000000 P2N13=-nan P2N31=-nan P312N=2.000000 P31N2=3.000000 P321N=2.000000 P32N1=3.000000 P3N12=-nan P3N21=-nan',
    'PN123=1.000000 PN132=1.000000 PN213=1.000000 PN231=1.000000 PN312=1.000000 PN321=1.000000 N123P=2.000000 N12P3=2.000000 N132P=2.000000 N13P2=3.000000',
    'N1P23=nan N1P32=nan N213P=2.000000 N21P3=2.000000 N231P=2.000000 N23P1=3.000000 N2P13=nan N2P31=nan N312P=2.000000 N31P2=3.000000',
    'N321P=2.000000 N32P1=3.000000 N3P12=nan N3P21=nan NP123=1.000000 NP132=1.000000 NP213=1.000000 NP231=1.000000 NP312=1.000000 NP321=1.000000',
    'eg6b8N73f2a5d194c=3.000000 5a9c36bef4gd7P218=12.000000 5af36g47d2c1e89Nb=9.000000 7aPceb123496g85df=6.000000 e34c1N785g69df2hba=6.500000 8752gehcfaP493d16b=16.500000 9c36b2e584a7hgfNd1=10.500000 7bePg81fc6hd9a2543=5.500000 6d9i3ha8g7c2N5f14eb=16.000000 i472aPfd5hc1eg986b3=6.000000',
    '531dfai9cebg28hN764=13.000000 gahiP83b67f24e195cd=5.000000 N24b1fjdc59ih8ke637ga=10.000000 7P8fia43jedc65g1b2hk9=10.000000 c3ed2ikh17f5a8946Nbjg=12.000000 3kgfiP15hd976a48e2jcb=6.000000 5cnea1i4N6hmk892dojl7f3gb=7.000000 9n82kdlaic643Ph1fob7e5jmg=23.000000 m816e9fabh3lconig75Nk4d2j=16.000000 Pfgk5bh9aco836e17lin24mdj=12.000000',
    '3452N16=5.000000 62514N3=5.000000 61354N2=5.000000 2N15643=3.000000 364N18257=1.000000 7214N8356=-nan 347N62185=1.000000 75N438261=2.000000 689N7a13425=2.000000 4823Na16957=1.000000',
    '653a794N821=9.000000 N7a18693254=5.000000',
  ]

  it('picks the element Second Life does for every list', async () => {
    const expected = entries(IN_WORLD)
    const cases = expected.map((e) => e.split('=')[0]!)
    const source = `float P; float N;
string D = "123456789abcdefghijklmnopq";
list mk(string s) {
  list l; integer i; integer n = llStringLength(s);
  for (i = 0; i < n; i++) {
    string c = llGetSubString(s, i, i);
    if (c == "N") l += N; else if (c == "P") l += P; else l += (float)(llSubStringIndex(D, c) + 1);
  }
  return l;
}
list C = [${cases.map((c) => `"${c}"`).join(', ')}];
default {
  state_entry() {
    P = (float)"nan"; N = (float)"-nan";
    integer i; string buf; integer n = llGetListLength(C);
    for (i = 0; i < n; i++) {
      string c = llList2String(C, i);
      buf += " " + c + "=" + llList2CSV([llListStatistics(LIST_STAT_MEDIAN, mk(c))]);
      if (llStringLength(buf) > 800) { llSay(0, buf); buf = ""; }
    }
    llSay(0, buf);
  }
}`
    expect(await results(source)).toEqual(expected)
  })
})
