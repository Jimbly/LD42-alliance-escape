Ludum Dare 42 - Running Out of Space
============================

* Intro
* Encounter Phase
* Special Event Phase
* Manage Phase
* Repeat


* Encounter Phase
  * Each non-cargo node can be toggled between 2-3 states
    * If power capacity is exceeded, reset the *last toggled* nodes to OFF until OK
  * Waves of enemies attack the ship and are resolved
  * If die, restart from beginning, or allow retrying the wave a couple times?
* Manage Phase
  * See data on next wave
  * See state of current planet / score if we settle here
  * Choose:
    * Settle here, or
    * Remove equipment + take cargo, or
    * Take no cargo, just continue


Encounter mechanic possibilities:
  Maybe just have On/Off state, and it switches from On to Off if overheating,
    and *then* if it's turned back on, it'll go into "over" mode, and stay on, taking damage
