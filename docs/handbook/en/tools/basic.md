# Math, text, and lists

These tools share their interfaces between CLI and Editor. See [platform support](contract.md).

## Before you start

Numeric inputs must be actual finite numbers; text "3" is not converted. Text and lists are limited to 100000 UTF-16 units/items. Some emoji occupy two UTF-16 units. BASIC_INPUT means invalid input; BASIC_LIMIT means a size limit.

The following are step fragments. Place them under steps in a complete flow and prepare an answer field. Every tool here returns an object with result: use outputs to select that property, or output to save the whole object. See the [complete example](reference.md#how-to-read-tool-documentation).

## math.abs

Get the absolute value, useful for distances or errors.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| value | number | Required | Number to process |

Returns: {result: 3}.

```yaml
- type: call
  target: math.abs
  inputs:
    value: -3
  output: $answer
```

## math.floor

Round toward negative infinity, useful for counting complete portions.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| value | number | Required | Number to process |

Returns: {result: 2}.

```yaml
- type: call
  target: math.floor
  inputs:
    value: 2.8
  output: $answer
```

## math.ceil

Round toward positive infinity, useful for pages or batches needed.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| value | number | Required | Number to process |

Returns: {result: 3}.

```yaml
- type: call
  target: math.ceil
  inputs:
    value: 2.1
  output: $answer
```

## math.round

Round to the nearest integer; ties go toward positive infinity, so -1.5 becomes -1.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| value | number | Required | Number to process |

Returns: {result: 3}.

```yaml
- type: call
  target: math.round
  inputs:
    value: 2.5
  output: $answer
```

## math.min

Find the smallest item in a nonempty list of finite numbers.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| values | number[] | Required | Nonempty finite-number list |

Returns: {result: 1}.

```yaml
- type: call
  target: math.min
  inputs:
    values:
      - 3
      - 1
      - 2
  output: $answer
```

## math.max

Find the largest item in a nonempty list of finite numbers.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| values | number[] | Required | Nonempty finite-number list |

Returns: {result: 3}.

```yaml
- type: call
  target: math.max
  inputs:
    values:
      - 3
      - 1
      - 2
  output: $answer
```

## math.clamp

Keep a number inside an inclusive range. With bounds 0–10, 12 becomes 10, -2 becomes 0, and 5 remains 5. Require min ≤ max.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| value | number | Required | Number to constrain
| min | number | Required | Lower bound
| max | number | Required | Upper bound |

Returns: {result: 10}.

```yaml
- type: call
  target: math.clamp
  inputs:
    value: 12
    min: 0
    max: 10
  output: $answer
```

## math.random

Generate a noncryptographic random decimal at least min and below max. Require min < max.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| min | number | Optional, 0 | Lower bound
| max | number | Optional, 1 | Exclusive upper bound |

Returns: {result: a varying number from 0 inclusive to 1 exclusive}.

```yaml
- type: call
  target: math.random
  inputs:
    min: 0
    max: 1
  output: $answer
```

## text.trim

Remove whitespace at both ends while retaining internal whitespace.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| text | string | Required | Text to process |

Returns: {result: "Hello"} (the greeting without outer spaces).

```yaml
- type: call
  target: text.trim
  inputs:
    text: "  Hello  "
  output: $answer
```

## text.split

Split text using a literal separator, not a regular expression.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| text | string | Required | Text to split
| separator | string | Required | Literal separator; empty splits UTF-16 units |

Returns: {result: ["a", "b"]}.

```yaml
- type: call
  target: text.split
  inputs:
    text: a,b
    separator: ","
  output: $answer
```

## text.replace

Replace every literal match, not only the first. No regular expressions.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| text | string | Required | Source text
| search | string | Required | Nonempty text to find
| replacement | string | Required | Replacement; may be empty |

Returns: {result: "x-b-x"}.

```yaml
- type: call
  target: text.replace
  inputs:
    text: a-b-a
    search: a
    replacement: x
  output: $answer
```

## array.concat

Merge multiple lists in order, flattening one level.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| arrays | JSON | Required | A list of lists |

Returns: {result: [1, 2, 3]}.

```yaml
- type: call
  target: array.concat
  inputs:
    arrays:
      - - 1
        - 2
      - - 3
  output: $answer
```

## array.slice

Extract part of a list. Negative indices count from the end; end is excluded.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| array | JSON | Required | Source list
| start | integer | Optional, 0 | Inclusive starting index
| end | integer | Optional | Exclusive end; omitted means through the end |

Returns: {result: [2, 3]}.

```yaml
- type: call
  target: array.slice
  inputs:
    array:
      - 1
      - 2
      - 3
    start: 1
    end: 3
  output: $answer
```

## array.length

Count list items, often for a loop condition.

| Parameter | Type | Requirement/default | Meaning |
| --- | --- | --- | --- |
| array | JSON | Required | List to count |

Returns: {result: 3}.

```yaml
- type: call
  target: array.length
  inputs:
    array:
      - 1
      - 2
      - 3
  output: $answer
```
