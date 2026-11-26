# markouts

Markouts of fills: the mid a fixed time after each fill, signed so positive means the fill made money (buy: later mid above the fill price; sell: below). A live tracker fed with the clock and the mid, a lookup in a recorded mid series, and size-weighted averages by side and horizon.

Use: `from markouts import hello`
