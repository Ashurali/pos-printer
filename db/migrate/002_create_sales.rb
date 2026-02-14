# db/migrate/002_create_sales.rb
class CreateSales < ActiveRecord::Migration[7.1]
  def change
    create_table :sales do |t|
      t.string   :invoice_number, null: false
      t.string   :cashier_name
      t.string   :customer_name
      t.string   :customer_phone
      t.string   :payment_method, null: false, default: 'cash'  # cash, debit, credit, transfer
      t.decimal  :subtotal,  precision: 15, scale: 2, default: 0
      t.decimal  :discount,  precision: 15, scale: 2, default: 0
      t.decimal  :tax,       precision: 15, scale: 2, default: 0
      t.decimal  :total,     precision: 15, scale: 2, default: 0
      t.decimal  :paid,      precision: 15, scale: 2, default: 0
      t.decimal  :change,    precision: 15, scale: 2, default: 0
      t.string   :status, default: 'completed'  # completed, voided, refunded
      t.text     :notes
      t.jsonb    :meta, default: {}

      t.references :user, foreign_key: true, null: true

      t.timestamps
    end

    add_index :sales, :invoice_number, unique: true
    add_index :sales, :status
    add_index :sales, :payment_method
    add_index :sales, :created_at

    create_table :sale_items do |t|
      t.references :sale, null: false, foreign_key: true
      t.string   :name, null: false
      t.string   :sku
      t.decimal  :weight, precision: 10, scale: 3  # grams
      t.string   :karat                              # 24K, 22K, 18K, etc.
      t.decimal  :price_per_gram, precision: 15, scale: 2
      t.decimal  :price,          precision: 15, scale: 2, null: false
      t.integer  :quantity, default: 1
      t.decimal  :line_total, precision: 15, scale: 2
      t.text     :description
      t.jsonb    :meta, default: {}

      t.timestamps
    end

    add_index :sale_items, :sku
  end
end
