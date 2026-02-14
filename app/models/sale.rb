# app/models/sale.rb
class Sale < ApplicationRecord
  belongs_to :user, optional: true
  has_many :sale_items, dependent: :destroy

  accepts_nested_attributes_for :sale_items, allow_destroy: true,
    reject_if: proc { |attrs| attrs['name'].blank? && attrs['price'].blank? }

  PAYMENT_METHODS = %w[cash debit credit transfer].freeze
  STATUSES        = %w[completed voided refunded].freeze

  validates :invoice_number, presence: true, uniqueness: true
  validates :payment_method, inclusion: { in: PAYMENT_METHODS }
  validates :status, inclusion: { in: STATUSES }
  validates :total, numericality: { greater_than_or_equal_to: 0 }

  before_validation :generate_invoice_number, on: :create, if: -> { invoice_number.blank? }
  before_save :calculate_totals

  scope :today, -> { where(created_at: Date.current.all_day) }
  scope :completed, -> { where(status: 'completed') }
  scope :by_date_range, ->(start_date, end_date) { where(created_at: start_date..end_date) }

  # ----- Invoice Number Generation -----

  def generate_invoice_number
    date_part = Date.current.strftime('%y%m%d')
    today_count = Sale.where('created_at >= ?', Date.current.beginning_of_day).count + 1
    self.invoice_number = "INV-#{date_part}-#{today_count.to_s.rjust(4, '0')}"
  end

  # ----- Calculation -----

  def calculate_totals
    self.subtotal = sale_items.reject(&:marked_for_destruction?).sum { |item| item.line_total || 0 }
    self.total = subtotal - (discount || 0) + (tax || 0)
    self.change = (paid || 0) - total if payment_method == 'cash'
  end

  # ----- Receipt Data for JS PrinterManager -----

  def to_receipt_data(store_info = {})
    {
      store: {
        name:    store_info[:name]    || 'TOKO EMAS',
        address: store_info[:address] || '',
        phone:   store_info[:phone]   || '',
        npwp:    store_info[:npwp]    || '',
      },
      invoiceNo:     invoice_number,
      cashierName:   cashier_name || 'Admin',
      items: sale_items.map do |item|
        {
          name:   item.name,
          weight: item.weight.to_f,
          karat:  item.karat || '24K',
          price:  item.price.to_f,
          qty:    item.quantity || 1,
        }
      end,
      subtotal:      subtotal.to_f,
      discount:      discount.to_f,
      tax:           tax.to_f,
      total:         total.to_f,
      paid:          paid.to_f,
      change:        change.to_f,
      paymentMethod: payment_method,
    }
  end
end
