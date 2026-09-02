function ProductTable({ products, onAdd, emptyMessage = "No matching products." }) {
  return (
    <div className="sales-table-wrap">
      <table className="sales-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th className="sales-cell-right">Available</th>
            <th className="sales-cell-right">Unit Price</th>
            <th className="sales-cell-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td colSpan={5} className="sales-empty-cell">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            products.map((product) => {
              const stock = Number(product.quantity) || 0;
              return (
                <tr key={product._id}>
                  <td>{product.itemName}</td>
                  <td>{product.sku}</td>
                  <td className="sales-cell-right">{stock}</td>
                  <td className="sales-cell-right">
                    {Number(product.sellingPrice || 0).toFixed(2)}
                  </td>
                  <td className="sales-cell-right">
                    <button
                      type="button"
                      className="sales-link-button"
                      onClick={() => onAdd(product)}
                      disabled={stock <= 0}
                    >
                      Add
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default ProductTable;
