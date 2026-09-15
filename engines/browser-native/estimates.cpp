// These table-based hardware arithmetic helpers are needed by SDK math. They
// carry no CPU interpreter, instruction dispatch, graphics or emulator state.
#include "vendor/dolphin/Common/FloatUtils.h"
extern "C" double portFrsqrte(double value)
{
    return Common::ApproximateReciprocalSquareRoot(value);
}
extern "C" double portFres(double value)
{
    return Common::ApproximateReciprocal(value);
}

// Copyright 2009 Dolphin Emulator Project
// SPDX-License-Identifier: GPL-2.0-or-later
// Adapted from Force25Bit, Core/PowerPC/Interpreter/Interpreter_FPUtils.h,
// at the same revision recorded in vendor/dolphin/source.json.
extern "C" double portRound25(double value)
{
    u64 integral=std::bit_cast<u64>(value);
    const u64 exponent=integral&Common::DOUBLE_EXP,fraction=integral&Common::DOUBLE_FRAC;
    if(exponent==0&&fraction!=0) {
        s64 keep_mask=static_cast<s64>(0xFFFFFFFFF8000000ULL);
        u64 round=0x8000000;
        u32 shift=std::countl_zero(fraction)-(63-Common::DOUBLE_FRAC_WIDTH);
        keep_mask>>=shift;round>>=shift;
        integral=(integral&keep_mask)+(integral&round);
    } else integral=(integral&0xFFFFFFFFF8000000ULL)+(integral&0x8000000);
    return std::bit_cast<double>(integral);
}
extern "C" void portEstimateBits(const double* input,double* output)
{
    *output=portFrsqrte(*input);
}
