# db/migrate/001_create_printer_settings.rb
class CreatePrinterSettings < ActiveRecord::Migration[7.1]
  def change
    create_table :printer_settings do |t|
      t.string  :device_name
      t.string  :device_id
      t.string  :paper_width, default: '80mm', null: false
      t.boolean :auto_reconnect, default: true
      t.integer :chunk_size, default: 512
      t.integer :chunk_delay, default: 50
      t.integer :cash_drawer_pin, default: 2
      t.jsonb   :meta, default: {}

      t.references :user, foreign_key: true, null: true

      t.timestamps
    end

    add_index :printer_settings, :device_id
  end
end
