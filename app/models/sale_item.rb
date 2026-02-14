# app/models/sale_item.rb
class SaleItem < ApplicationRecord
  belongs_to :sale

  KARAT_OPTIONS = %w[24K 22K 20K 18K 16K 14K 10K 9K 8K].freeze

  validates :name, presence: true
  validates :price, presence: true, numericality: { greater_than: 0 }
  validates :quantity, numericality: { greater_than: 0 }
  validates :weight, numericality: { greater_than: 0 }, allow_nil: true
  validates :karat, inclusion: { in: KARAT_OPTIONS }, allow_blank: true

  before_save :calculate_line_total

  def calculate_line_total
    self.line_total = (price || 0) * (quantity || 1)
  end

  # Gold purity percentage
  def purity_percentage
    return nil unless karat.present?
    karat_value = karat.gsub(/[^0-9]/, '').to_f
    (karat_value / 24.0 * 100).round(2)
  end
end
