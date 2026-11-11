
default {
  state_entry(){
    float foo = (integer)"1";
    print((string)[(string)(foo + foo * 4), "hello!"]);
    // These should all print -2147483648 per Mono.
    print((string)((integer)((float)"Inf")));
    print((string)((integer)((float)"-Inf")));
    print((string)((integer)((float)"NaN")));
  }
}
