export enum FailureCode {
    InsufficientFunds = 'INSUFFICIENT_FUNDS',
    ReversalWouldCauseNegativeBalance = 'REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE',
    ReferenceNotFound = 'REFERENCE_NOT_FOUND',
    ReferenceMismatch = 'REFERENCE_MISMATCH',
    InvalidReferenceKind = 'INVALID_REFERENCE_KIND',
    AlreadyReversed = 'ALREADY_REVERSED',
    AmountMismatch = 'AMOUNT_MISMATCH',
    CurrencyMismatch = 'CURRENCY_MISMATCH',
}