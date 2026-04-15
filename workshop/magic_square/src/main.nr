fn main(square: [[u8; 3]; 3]) {
    check_square(square);
}

fn check_square(square: [[u8; 3]; 3]) {
    // check that all nubmers are single-digit
    for i in 0..3 {
        for j in 0..3 {
            assert(square[i][j] < 10);
        }
    }

    let sum_rows = check_rows(square);
    let sum_columns = check_columns(square);
    let sum_diag = check_diags(square);

    assert((sum_rows == sum_columns) & (sum_columns == sum_diag));
}

fn check_rows(square: [[u8; 3]; 3]) -> u8 {
    // use for_each
    let sum0 = &mut 0;
    square[0].for_each(|element| {
        *sum0 += element
    });
    // assert(sum0 == 15);

    // use fold
    let sum1 = square[1].fold(0, |acc, x| acc + x);
    // assert(sum1 == 15);

    // or just iterate
    let mut sum2 = 0;
    for i in 0..3 {
        sum2 += square[2][i]
    };
    //assert(sum2 == 15)

    assert((*sum0 == sum1) & (sum1 == sum2));
    *sum0
}

fn check_columns(square: [[u8; 3]; 3]) -> u8 {
    let mut sums = [0, 0, 0];
    for i in 0..3 {
        for j in 0..3 {
            sums[i] += square[j][i];
        };
    };

    assert((sums[0] == sums[1]) & (sums[1] == sums[2]));
    sums[0]
}

fn check_diags(square: [[u8; 3]; 3]) -> u8 {
    let mut sum0 = 0;
    let mut sum1 = 0;
    for i in 0..3 {
        sum0 += square[i][i]
    };
    for i in 0..3 {
        sum1 += square[i][2-i]
    };

    assert(sum0 == sum1);
    sum0
}

#[test]
fn test_valid_magic_square() {
    let square = [[8, 1, 6], [3, 5, 7], [4, 9, 2]];
    check_square(square);
}

#[test(should_fail)]
fn test_invalid_magic_square() {
    let square = [[8, 1, 5], [2, 5, 7], [4, 9, 1]];
    check_square(square);
}
