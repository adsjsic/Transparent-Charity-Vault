(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-AMOUNT (err u101))
(define-constant ERR-ALLOCATION-FAILED (err u102))
(define-constant ERR-WITHDRAWAL-NOT-APPROVED (err u103))
(define-constant ERR-CAMPAIGN-CLOSED (err u104))
(define-constant ERR-INVALID-PERCENT (err u105))
(define-constant ERR-BUCKET-NOT-FOUND (err u106))
(define-constant ERR-INSUFFICIENT-BALANCE (err u107))
(define-constant ERR-INVALID-BUCKET-NAME (err u108))
(define-constant ERR-MAX-BUCKETS-EXCEEDED (err u109))

(define-data-var campaign-owner principal tx-sender)
(define-data-var is-active bool true)
(define-data-var total-funds uint u0)
(define-data-var creation-timestamp uint block-height)

(define-map buckets 
  (string-ascii 32)
  {
    balance: uint,
    allocated-percent: uint,
    description: (string-utf8 100)
  }
)

(define-map allocations-history
  uint
  {
    timestamp: uint,
    amount: uint,
    bucket: (string-ascii 32),
    donor: principal
  }
)

(define-map withdrawal-proposals
  uint
  {
    id: uint,
    amount: uint,
    bucket: (string-ascii 32),
    recipient: principal,
    proposer: principal,
    approvals: uint,
    required-approvals: uint,
    status: bool
  }
)

(define-data-var next-proposal-id uint u0)
(define-data-var next-history-id uint u0)
(define-data-var num-buckets uint u0)
(define-data-var max-buckets uint u5)
(define-data-var required-approvals uint u2)

(define-read-only (get-total-funds)
  (var-get total-funds)
)

(define-read-only (get-bucket-balances (name (string-ascii 32)))
  (match (map-get? buckets name)
    b { balance: (get balance b), allocated-percent: (get allocated-percent b), description: (get description b) }
    none
  )
)

(define-read-only (get-campaign-status)
  (var-get is-active)
)

(define-read-only (get-campaign-owner)
  (var-get campaign-owner)
)

(define-read-only (get-all-buckets)
  (ok (list 
    "projects" 
    "operations" 
    "reserves" 
    "emergency" 
    "incentives"
  ))
)

(define-read-only (get-proposal (id uint))
  (map-get? withdrawal-proposals id)
)

(define-read-only (get-history-length)
  (var-get next-history-id)
)

(define-read-only (get-history-entry (id uint))
  (map-get? allocations-history id)
)

(define-private (validate-percent (p uint))
  (if (and (<= p u100) (> p u0))
    (ok true)
    (err ERR-INVALID-PERCENT)
  )
)

(define-private (validate-bucket-name (name (string-ascii 32)))
  (if (or 
    (is-eq name "projects")
    (is-eq name "operations")
    (is-eq name "reserves")
    (is-eq name "emergency")
    (is-eq name "incentives")
  )
    (ok true)
    (err ERR-INVALID-BUCKET-NAME)
  )
)

(define-private (validate-amount (amt uint))
  (if (> amt u0)
    (ok true)
    (err ERR-INVALID-AMOUNT)
  )
)

(define-private (is-owner-or-admin)
  (or (is-eq tx-sender (var-get campaign-owner)) false)
)

(define-public (initialize-buckets 
  (proj-percent uint) 
  (ops-percent uint) 
  (res-percent uint) 
  (emer-percent uint) 
  (inc-percent uint)
)
  (let ((total (+ proj-percent ops-percent res-percent emer-percent inc-percent)))
    (asserts! (is-owner-or-admin) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq total u100) ERR-INVALID-PERCENT)
    (asserts! (< (var-get num-buckets) (var-get max-buckets)) ERR-MAX-BUCKETS-EXCEEDED)
    (try! (map-insert buckets "projects" { balance: u0, allocated-percent: proj-percent, description: (string-ascii "Project funding") }))
    (try! (map-insert buckets "operations" { balance: u0, allocated-percent: ops-percent, description: (string-ascii "Operational costs") }))
    (try! (map-insert buckets "reserves" { balance: u0, allocated-percent: res-percent, description: (string-ascii "Emergency reserves") }))
    (try! (map-insert buckets "emergency" { balance: u0, allocated-percent: emer-percent, description: (string-ascii "Emergency fund") }))
    (try! (map-insert buckets "incentives" { balance: u0, allocated-percent: inc-percent, description: (string-ascii "Donor incentives") }))
    (var-set num-buckets u5)
    (ok true)
  )
)

(define-public (receive-donation (amount uint))
  (begin
    (asserts! (var-get is-active) ERR-CAMPAIGN-CLOSED)
    (try! (validate-amount amount))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (var-set total-funds (+ (var-get total-funds) amount))
    (let ((hist-id (var-get next-history-id)))
      (map-set allocations-history hist-id 
        { timestamp: block-height, amount: amount, bucket: "", donor: tx-sender }
      )
      (var-set next-history-id (+ hist-id u1))
    )
    (map-set buckets "projects" 
      (merge 
        (unwrap! (map-get? buckets "projects") ERR-BUCKET-NOT-FOUND)
        { balance: (+ (get balance (unwrap! (map-get? buckets "projects") ERR-BUCKET-NOT-FOUND)) (/ (* amount (get allocated-percent (unwrap! (map-get? buckets "projects") ERR-BUCKET-NOT-FOUND))) u100)) }
      )
    )
    (map-set buckets "operations" 
      (merge 
        (unwrap! (map-get? buckets "operations") ERR-BUCKET-NOT-FOUND)
        { balance: (+ (get balance (unwrap! (map-get? buckets "operations") ERR-BUCKET-NOT-FOUND)) (/ (* amount (get allocated-percent (unwrap! (map-get? buckets "operations") ERR-BUCKET-NOT-FOUND))) u100)) }
      )
    )
    (map-set buckets "reserves" 
      (merge 
        (unwrap! (map-get? buckets "reserves") ERR-BUCKET-NOT-FOUND)
        { balance: (+ (get balance (unwrap! (map-get? buckets "reserves") ERR-BUCKET-NOT-FOUND)) (/ (* amount (get allocated-percent (unwrap! (map-get? buckets "reserves") ERR-BUCKET-NOT-FOUND))) u100)) }
      )
    )
    (map-set buckets "emergency" 
      (merge 
        (unwrap! (map-get? buckets "emergency") ERR-BUCKET-NOT-FOUND)
        { balance: (+ (get balance (unwrap! (map-get? buckets "emergency") ERR-BUCKET-NOT-FOUND)) (/ (* amount (get allocated-percent (unwrap! (map-get? buckets "emergency") ERR-BUCKET-NOT-FOUND))) u100)) }
      )
    )
    (map-set buckets "incentives" 
      (merge 
        (unwrap! (map-get? buckets "incentives") ERR-BUCKET-NOT-FOUND)
        { balance: (+ (get balance (unwrap! (map-get? buckets "incentives") ERR-BUCKET-NOT-FOUND)) (/ (* amount (get allocated-percent (unwrap! (map-get? buckets "incentives") ERR-BUCKET-NOT-FOUND))) u100)) }
      )
    )
    (print { event: "donation-received", amount: amount, donor: tx-sender })
    (ok true)
  )
)

(define-public (propose-withdrawal (amount uint) (bucket (string-ascii 32)) (recipient principal))
  (let ((prop-id (var-get next-proposal-id))
        (bucket-data (map-get? buckets bucket)))
    (asserts! (var-get is-active) ERR-CAMPAIGN-CLOSED)
    (asserts! (is-owner-or-admin) ERR-NOT-AUTHORIZED)
    (try! (validate-amount amount))
    (try! (validate-bucket-name bucket))
    (asserts! (some bucket-data) ERR-BUCKET-NOT-FOUND)
    (asserts! (<= amount (get balance bucket-data)) ERR-INSUFFICIENT-BALANCE)
    (map-set withdrawal-proposals prop-id 
      { 
        id: prop-id, 
        amount: amount, 
        bucket: bucket, 
        recipient: recipient, 
        proposer: tx-sender, 
        approvals: u0, 
        required-approvals: (var-get required-approvals), 
        status: false 
      }
    )
    (var-set next-proposal-id (+ prop-id u1))
    (print { event: "withdrawal-proposed", id: prop-id })
    (ok prop-id)
  )
)

(define-public (approve-proposal (prop-id uint))
  (let ((proposal (map-get? withdrawal-proposals prop-id)))
    (match proposal p
      (begin
        (asserts! (and (not (get status p)) (is-owner-or-admin)) ERR-NOT-AUTHORIZED)
        (let ((new-approvals (+ (get approvals p) u1)))
          (if (>= new-approvals (get required-approvals p))
            (begin
              (map-set withdrawal-proposals prop-id 
                (merge p { approvals: new-approvals, status: true })
              )
              (try! (as-contract (stx-transfer? (get amount p) (as-contract tx-sender) (get recipient p))))
              (let ((bucket-data (map-get? buckets (get bucket p))))
                (map-set buckets (get bucket p) 
                  (merge bucket-data { balance: (- (get balance bucket-data) (get amount p)) })
                )
              )
              (var-set total-funds (- (var-get total-funds) (get amount p)))
              (print { event: "proposal-approved-and-executed", id: prop-id })
              (ok true)
            )
            (begin
              (map-set withdrawal-proposals prop-id 
                (merge p { approvals: new-approvals })
              )
              (print { event: "proposal-approved", id: prop-id })
              (ok true)
            )
          )
        )
      )
      (err ERR-WITHDRAWAL-NOT-APPROVED)
    )
  )
)

(define-public (close-campaign)
  (begin
    (asserts! (is-owner-or-admin) ERR-NOT-AUTHORIZED)
    (var-set is-active false)
    (print { event: "campaign-closed" })
    (ok true)
  )
)

(define-public (set-required-approvals (new-req uint))
  (begin
    (asserts! (is-owner-or-admin) ERR-NOT-AUTHORIZED)
    (asserts! (and (> new-req u0) (<= new-req u5)) ERR-INVALID-AMOUNT)
    (var-set required-approvals new-req)
    (ok true)
  )
)