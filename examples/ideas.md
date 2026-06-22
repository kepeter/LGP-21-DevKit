# LGP-21 Compiler Sample Programs

## 1. Fibonacci Sequence (Iterative Limit)
* **The Math**: Computes the sequence where $F_n = F_{n-1} + F_{n-2}$.
* **Limit**: Runs up to the maximum 31-bit signed integer limit ($F_{46} = 1,836,311,903$).
* **Focus**: This sample focuses entirely on pure integer addition, loop execution speed, and out-of-bounds testing. It tests how cleanly the compiler handles boundary limits without throwing unhandled overflows.

## 2. Array Checksum & Average
* **The Math**: Iterates through an array of data points of size $N$, sums them up to calculate a 32-bit arithmetic checksum, and divides the total by the element count to find the mean $\mu$:

$$ \mu = \frac{1}{N} \sum_{i=1}^{N} x_i $$

* **Focus**: This program focuses on multi-word accumulation, checking how the compiler manages intermediate carry bits during the summation, and tests fixed-point division efficiency.

## 3. Square Root via Heron's Method
* **The Math**: Approximates the square root of a fixed-point number $\sqrt{S}$ using the Babylonian iterative formula:

$$ x_{n+1} = \frac{1}{2} \left( x_n + \frac{S}{x_n} \right) $$

* **Focus**: The loop terminates when the change drops below a precise tolerance: $|x_{n+1} - x_n| < \epsilon$. This serves as an excellent test for nested division loops and checking for convergence within a specific fractional precision tolerance.

## 4. Polynomial Evaluation (Horner's Method)
* **The Math**: Calculates the value of a cubic polynomial $f(x)$ using nested multiplications to dramatically optimize register usage:

$$ f(x) = ((ax + b)x + c)x + d $$

* **Focus**: This program focuses heavily on consecutive multiplications. It tests the compiler's ability to track and maintain correct fractional scaling and bit-shifting across multiple sequential algebraic steps.

## 5. Sine Approximation via Taylor Series
* **The Math**: Computes $\sin(x)$ for a given fixed-point angle using the first three terms of its alternating Taylor expansion:

$$ \sin(x) \approx x - \frac{x^3}{3!} + \frac{x^5}{5!} $$

* **Focus**: This is a rigorous test for complex fixed-point math. It forces the compiler to handle successive exponent multi-multiplications, division by constants ($3! = 6$ and $5! = 120$), and managing alternating signs ($+/-$) without losing precision.

## 6. Coordinate Rotation (CORDIC Algorithm)
* **The Math**: Rotates a 2D vector $(x,y)$ through an angle $\theta$. It bypasses hardware multiplication limitations completely by utilizing iterative vector additions, subtractions, and bit-shifts:

$$ x_{k+1} = x_k - y_k \cdot d_k \cdot 2^{-k} $$
$$ y_{k+1} = y_k + x_k \cdot d_k \cdot 2^{-k} $$

* **Focus**: This focuses on intense loop structures, parallel variable updates, and bit-shifting logic ($2^{-k}$). It proves whether the compiler can optimize pure bitwise shifting to solve trigonometric problems.
